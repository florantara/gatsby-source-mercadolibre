const { createRemoteFileNode } = require("gatsby-source-filesystem");
const fetch = require("node-fetch");

const apiHost = "https://api.mercadolibre.com";

// Get product main data
// Documentation: https://api.mercadolibre.com/items/:id#options
exports.getCompleteProductData = itemID => {
  return fetch(`${apiHost}/items/${itemID}`)
    .then(response => response.json())
    .then(allProductData => allProductData)
    .catch(err =>
      console.log(
        "An error ocurred while fetching a product from Mercado Libre.",
        err.code
      )
    );
};

// Query the /pictures/:id endpoint
// and import the largest image from
// the variations provided,
// so they can be processed by transformer plugins
exports.importAndCreateImageNodes = async data => {
  if (!data.productPictures || data.productPictures.length === 0) {
    return;
  }
  let picturesToProcess = data.productPictures;
  if (data.totalProducts > 300) {
    // Note: We are currently limiting to 3 images per product on their lowest size
    // due to a bug that happens when importing
    // several images and the build hangs on "souce and transform nodes..."
    // It usually fixes the problem but large stores
    // might still fail
    // https://github.com/gatsbyjs/gatsby/issues/6654
    picturesToProcess = data.productPictures.filter((p, i) => i < 3);
  }
  const largestPictures = data.productPictures.map(async pic => {
    const image = await fetch(`${apiHost}/pictures/${pic.id}`)
      .then(res => {
        if (res.status === 200) {
          return res.json();
        } else {
          console.log("Response not 200");
        }
      })
      .catch(() => {
        console.log("Fetching image for product failed =>", data.productName);
      });
    if (image) {
      const largest = image.variations && image.variations[0];
      image.variations && data.totalProducts > 300
        ? image.variations[image.variations.length - 1]
        : image.variations.find(i => i.size === image.max_size);
      if (largest) {
        return {
          url: largest.secure_url,
          id: image.id
        };
      }
    }
  });

  try {
    async function createNodes() {
      let nodes = [];
      const pictures = await Promise.all(largestPictures);
      for (const pic of pictures) {
        if (pic) {
          const node = await createImageNode(pic, data);
          if (node) {
            nodes.push(node);
          }
        }
      }
      return nodes;
    }
    return createNodes();
  } catch (error) {
    return [];
  }
};

exports.importAndCreateThumbnailNode = async data => {
  if (!data.thumbnail) {
    return;
  }

  const thumbnail = await fetch(`${apiHost}/pictures/${data.thumbnail.id}`)
    .then(res => {
      if (res.status === 200) {
        return res.json();
      }
    })
    .then(image => {
      if (image) {
        const largest =
          image.variations &&
          image.variations.find(i => i.size === image.max_size);
        if (largest) {
          return {
            url: largest.secure_url,
            id: image.id
          };
        }
      }
    })
    .catch(error => {
      console.log("thumbnail image failed", error.code);
    });

  if (thumbnail) {
    return createImageNode(thumbnail, data);
  }
  return false;
};

async function createImageNode(pic, data) {
  let fileNode = null;
  if (pic && pic.url && data.productID) {
    try {
      fileNode = await createRemoteFileNode({
        url: pic.url,
        parent: data.productID,
        store: data.store,
        cache: data.cache,
        createNode: data.createNode,
        createNodeId: () => `ml-image-${data.productID}-${pic.id}`
      });
    } catch (e) {
      console.log(`Error importing image from MercadoLibre - ${e}`);
    }
    if (fileNode) {
      return { image___NODE: fileNode.id };
    }
    return;
  }
}

// Helper function that processes a product to match Gatsby's node structure
exports.processProduct = (product, createNodeId, createContentDigest) => {
  const nodeId = createNodeId(`ML-Product-${product.id}`);
  const nodeContent = JSON.stringify(product);
  const nodeData = Object.assign({}, product, {
    id: nodeId,
    parent: null,
    children: [],
    internal: {
      type: `MercadoLibreProduct`,
      content: nodeContent,
      contentDigest: createContentDigest(product)
    }
  });
  return nodeData;
};

// Seller data
exports.createSellerNode = (data, createNodeId, createContentDigest) => {
  const nodeId = createNodeId(`ML-Seller`);
  const nodeContent = JSON.stringify(data);
  const nodeData = {
    id: nodeId,
    seller: data,
    parent: null,
    children: [],
    internal: {
      type: `MercadoLibreSeller`,
      content: nodeContent,
      contentDigest: createContentDigest(data)
    }
  };
  return nodeData;
};

// Store wide available filters
exports.createStoreFiltersNode = (data, createNodeId, createContentDigest) => {
  const nodeId = createNodeId(`ML-StoreFilters`);
  const nodeContent = JSON.stringify(data);
  const nodeData = {
    id: nodeId,
    filters: data,
    parent: null,
    children: [],
    internal: {
      type: `MercadoLibreFilters`,
      content: nodeContent,
      contentDigest: createContentDigest(data)
    }
  };
  return nodeData;
};

// Get the product's description
// Documentation: https://api.mercadolibre.com/items/#options
exports.getItemDescription = itemID => {
  return fetch(`${apiHost}/items/${itemID}/description`)
    .then(description => description.json())
    .catch(() => {
      console.log(
        `\n ℹ️  Product with id ${itemID} didn't provide a description from the API.`
      );
    });
};

// Get the product's category information
// Documentation: https://developers.mercadolibre.com.ar/en_us/categories-attributes
exports.getCategoryData = categoryID => {
  return fetch(`${apiHost}/categories/${categoryID}`)
    .then(category => category.json())
    .then(category => ({
      category_id: category.id || "",
      category_name: category.name || "",
      children_categories: category.children_categories || [],
      path_from_root: category.path_from_root || []
    }))
    .catch(e => {
      return "";
    });
};
