const { createRemoteFileNode } = require("gatsby-source-filesystem")
const fetch = require("node-fetch")

const apiHost = "https://api.mercadolibre.com"

// Get product main data
// Documentation: https://api.mercadolibre.com/items/:id#options
exports.getCompleteProductData = itemID => {
  return fetch(`${apiHost}/items/${itemID}`)
    .then(response => response.json())
    .then(allProductData => allProductData)
    .catch(err =>
      console.log(
        "An error ocurred while fetching a product from Mercado Libre.",
        err
      )
    )
}

// Query the /pictures/:id endpoint
// and import the largest image from
// the variations provided,
// so they can be processed by transformer plugins
exports.importAndCreateImageNodes = async data => {
  if (!data.productPictures || data.productPictures.length === 0) {
    return
  }
  const largestPictures = data.productPictures.map(async pic => {
    const image = await fetch(`${apiHost}/pictures/${pic.id}`).then(data =>
      data.json()
    )
    return {
      url: image.variations[0].secure_url,
      id: image.id,
    }
  })

  const pictures = await Promise.all(largestPictures)
  const nodes = pictures.map(async pic => await createImageNode(pic, data))
  return Promise.all(nodes).then(nodes => nodes)
}

exports.importAndCreateThumbnailNode = async data => {
  if (!data.thumbnail) {
    return
  }
  const thumbnail = await fetch(`${apiHost}/pictures/${data.thumbnail.id}`)
    .then(data => data.json())
    .then(image => {
      return {
        url: image.variations[0].secure_url,
        id: image.id,
      }
    })

  return createImageNode(thumbnail, data)
}

async function createImageNode(pic, data) {
  let fileNode
  try {
    fileNode = await createRemoteFileNode({
      url: pic.url,
      parent: data.productID,
      store: data.store,
      cache: data.cache,
      createNode: data.createNode,
      createNodeId: () => `ml-image-${data.productID}-${pic.id}`,
    })
  } catch (e) {
    console.log(`Error importing image from MercadoLibre - ${e}`)
  }
  if (fileNode) {
    return { image___NODE: fileNode.id }
  }
}

// Helper function that processes a product to match Gatsby's node structure
exports.processProduct = (product, createNodeId, createContentDigest) => {
  const nodeId = createNodeId(`ML-Product-${product.id}`)
  const nodeContent = JSON.stringify(product)
  const nodeData = Object.assign({}, product, {
    id: nodeId,
    parent: null,
    children: [],
    internal: {
      type: `MercadoLibreProduct`,
      content: nodeContent,
      contentDigest: createContentDigest(product),
    },
  })

  return nodeData
}

// Get the product's description
// Documentation: https://api.mercadolibre.com/items/#options
exports.getItemDescription = itemID => {
  return fetch(`${apiHost}/items/${itemID}/description`)
    .then(description => description.json())
    .catch(() => {
      console.log(
        `\n ℹ️  Product with id ${itemID} didn't provide a description from the API.`
      )
    })
}
