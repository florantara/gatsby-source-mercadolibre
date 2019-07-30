const fetch = require("node-fetch");
const { createRemoteFileNode } = require(`gatsby-source-filesystem`);
const {
  importAndCreateImageNodes,
  importAndCreateThumbnailNode,
  getCompleteProductData,
  processProduct,
  createSellerNode,
  createStoreFiltersNode,
  getItemDescription,
  getCategoryData
} = require("./utils");

exports.sourceNodes = (
  { actions, createNodeId, createContentDigest, store, cache, reporter },
  configOptions
) => {
  const { createNode } = actions;
  const apiHost = "https://api.mercadolibre.com";
  const { site_id, username } = configOptions;
  if (!username) {
    console.log(
      "\n ⚠️  Please add a username to the gatsby-source-mercadolibre plugin configuration in /gatsby-config.js."
    );
    return;
  }
  if (!site_id) {
    console.log(
      "\n ⚠️  Please add a site_id to the gatsby-source-mercadolibre plugin configuration in /gatsby-config.js."
    );
    return;
  }

  // Gatsby adds a configOption that's not needed for this plugin, delete it
  delete configOptions.plugins;

  // Get list of products
  // Documentation: https://api.mercadolibre.com/sites/MLA/search?#options
  const userEndpoint = `${apiHost}/sites/${site_id}/search?nickname=${username}`;

  return fetch(userEndpoint)
    .then(async response => {
      const parsedInitialResponse = await response.json();
      const totalProducts = parsedInitialResponse.paging.total;
      const storeFilters = parsedInitialResponse.available_filters;
      const results = [...parsedInitialResponse.results]; // Initial results
      const allPages = [];

      // MercadoLibre paginates the results by 50
      // and offers the offset parameter to get
      // the consequent pages/products
      let offset = 50;
      const totalFetches = Math.ceil(totalProducts / 50);
      const remainingFetches = totalFetches - 1;
      for (let f = 0; f < remainingFetches; f++) {
        allPages.push(
          fetch(`${userEndpoint}&offset=${offset}`).then(async response => {
            const parsedResults = await response.json();
            const productsReceivedAmount = parsedResults.results.length;

            parsedResults && results.push(...parsedResults.results);
          })
        );
        offset = offset + 50;
      }

      // Bring in some info about the seller
      let sellerInfo = {};
      const sellerQuery = fetch(
        `${apiHost}/users/${parsedInitialResponse.seller.id}`
      )
        .then(data => data.json())
        .then(data => {
          Object.assign(sellerInfo, data);
        });

      return Promise.all([...allPages, sellerQuery]).then(() => ({
        results,
        storeFilters,
        seller: { tags: sellerInfo.tags, permalink: sellerInfo.permalink } // we don't want to import everything from the seller endpoint
      }));
    })
    .then(data => {
      const storeFilters = data.storeFilters;
      const productsReceived = data.results;
      const seller = data.seller;
      if (productsReceived.length === 0) {
        reporter.warn(
          "Mercado Libre API returned 0 products. Check the configuration options and make sure the user has published products."
        );
      } else {
        // Grab all the product data from the https://api.mercadolibre.com/items/:id` endpoint
        // Documentation: https://api.mercadolibre.com/items/#options

        reporter.info("Importing from Mercado Libre...");
        if (productsReceived.length > 50) {
          reporter.info(
            `Importing a lot of products (${
              productsReceived.length
            }). This may take a while.`
          );
        }
        if (productsReceived.length > 300) {
          reporter.warn("Limiting to 3 images per product.");
        }
        const allProducts =
          productsReceived &&
          productsReceived.map(productData => {
            return getCompleteProductData(productData.id)
              .then(async product => ({
                ...product,
                // itemID: GraphQL overrides the id field with its own number, so we use itemID to store the ML id
                itemID: product && product.id,
                // itemDescription: Comes from a different endpoint
                itemDescription: await getItemDescription(productData.id).then(
                  description => description && description.plain_text
                ),
                // itemCategory: Get the complete information about the category, not just the ID.
                itemCategory: await getCategoryData(
                  productData.category_id
                ).then(category => category),
                // itemImages: Process into the data layer the largest variation of each img
                itemImages: await importAndCreateImageNodes({
                  productName: product && product.title, // So we can apply a max limit
                  totalProducts: productsReceived.length, // So we can apply a max limit
                  productID: product && product.id,
                  productPictures: product && product.pictures,
                  store,
                  cache,
                  createNode
                }),
                // itemThumbnail: Make the first image given by product.pictures be the thumbnail
                itemThumbnail: await importAndCreateThumbnailNode({
                  productID: product && product.id,
                  thumbnail: product && product.pictures[0],
                  store,
                  cache,
                  createNode
                }),

                // Store something for potentially null values:
                video_id: product.video_id || "",
                original_price: product.original_price || product.price
              }))
              .catch(error => {
                console.log("Error getting all product data ");
              });
          });

        return Promise.all(allProducts).then(results => ({
          results,
          storeFilters,
          seller
        }));
      }
    })
    .then(async data => {
      let storeFilters = data.storeFilters;
      let seller = data.seller;
      const allProductsProcessed = data.results;

      reporter.info(
        `${allProductsProcessed.length} products imported. Creating nodes... `
      );

      // Query the /category endpoint to get more
      // information about the Category filter.
      // children_categories and path_from_root
      // in particular are important
      async function getAllCategoriesData() {
        let updatedCategories = [];
        const categories = storeFilters.find(f => f.id === "category");

        if (categories) {
          for (const category of categories.values) {
            if (category) {
              const categoryData = await getCategoryData(category.id);
              if (categoryData) {
                updatedCategories.push({ ...category, ...categoryData });
              }
            }
          }
          return updatedCategories;
        }
      }

      // Update the category filter with the new data
      for (const filter of storeFilters) {
        if (filter.id === "category") {
          const categories = await getAllCategoriesData();
          storeFilters = storeFilters.map(f =>
            f.id === "category" ? { ...f, values: categories } : f
          );
        }
      }

      if (!storeFilters.find(f => f.id === "category")) {
        // If there isn't a category filter
        // store at least on 1 item
        // the children_categories and path_from_root
        // to prevent GraphQL from failing at null properties
        storeFilters[0] = {
          ...storeFilters[0],
          values: [
            {
              ...storeFilters[0].values,
              children_categories: [{ id: "", name: "" }],
              path_from_root: [{ id: "", name: "" }]
            }
          ]
        };
      }

      // Create Filters Nodes
      const sellerNode = createSellerNode(
        seller,
        createNodeId,
        createContentDigest
      );
      createNode(sellerNode);

      // Create Filters Nodes
      const filtersNode = createStoreFiltersNode(
        storeFilters,
        createNodeId,
        createContentDigest
      );
      createNode(filtersNode);

      // Create Products Nodes
      allProductsProcessed.forEach(async product => {
        const nodeData = await processProduct(
          product,
          createNodeId,
          createContentDigest
        );
        createNode(nodeData);
      });
    })
    .catch(err => {
      reporter.warn(
        `There was a problem with gatsby-source-mercadolibre. Check this endpoint: ↳ ${userEndpoint}`
      );
      console.log(err);
    });
};
