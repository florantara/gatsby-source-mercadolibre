const fetch = require("node-fetch");
const { createRemoteFileNode } = require(`gatsby-source-filesystem`);
const {
  importAndCreateImageNodes,
  importAndCreateThumbnailNode,
  getCompleteProductData,
  processProduct,
  getItemDescription
} = require("./utils");

exports.sourceNodes = (
  { actions, createNodeId, createContentDigest, store, cache },
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
    .then(response => response.json())
    .then(data => {
      if (data.results.length === 0) {
        console.log(
          `\n ⚠️ ️  Mercado Libre API returned 0 products. \n Check the configuration options and make sure the user has published products.`
        );
      } else {
        // Grab all the product data from the https://api.mercadolibre.com/items/:id` endpoint
        // Documentation: https://api.mercadolibre.com/items/#options
        const allProducts = data.results.map(productData => {
          return getCompleteProductData(productData.id).then(async product => ({
            ...product,
            // itemID: GraphQL overrides the id field with its own number, so we use itemID to store the ML id
            itemID: product.id,
            // itemDescription: Comes from a different endpoint
            itemDescription: await getItemDescription(productData.id).then(
              description => description.plain_text
            ),
            // itemImages: Process into the data layer the largest variation of each img
            itemImages: await importAndCreateImageNodes({
              productID: product.id,
              productPictures: product.pictures,
              store,
              cache,
              createNode
            }),
            // itemThumbnail: Make the first image given by product.pictures be the thumbnail
            itemThumbnail: await importAndCreateThumbnailNode({
              productID: product.id,
              thumbnail: product.pictures[0],
              store,
              cache,
              createNode
            })
          }));
        });
        return Promise.all(allProducts).then(results => results);
      }
    })
    .then(allProductsProcessed => {
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
      console.log(
        "\n ⚠️  There was a problem with gatsby-source-mercadolibre. Check this endpoint: ↳",
        userEndpoint
      );
    });
};
