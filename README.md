![GitHub](https://img.shields.io/github/license/florantara/gatsby-source-mercadolibre.svg)

<p align="center">
  <a href="https://www.gatsbyjs.org">
    <img alt="MercadoLibre" src="https://static.mlstatic.com/org-img/homesnw/img/ml-logo@2x.png?v=4.0" width="60" /> 
    <img alt="Gatsby" src="https://www.gatsbyjs.org/monogram.svg" width="60" />
  </a>
</p>

[GatsbyJS](https://www.gatsbyjs.org) plugin that pulls products data from [MercadoLibre](https://www.mercadolibre.com/) into GraphQL.

- No user authentication needed, it uses the public resource [search](https://api.mercadolibre.com/sites/MLA/search#options) from the API.
- Product images are imported into nodes so you can use with [gatsby-image](https://www.gatsbyjs.org/packages/gatsby-image/).

## Setup

#### 1 - Install Package

From the root of your Gatsby site:

```bash
npm install gatsby-source-mercadolibre
```

<h4 id="config"> 2 - Configure the plugin in `gatsby-config.js`</h4>

```javascript
module.exports = {
  plugins: [
    {
      resolve: `gatsby-source-mercadolibre`,
      options: {
        site_id: `your_site_id`,
        username: `your_username`
      }
    }
  ]
};
```

🕵🏼‍♀️
Find out your `site_id` [here](https://api.mercadolibre.com/sites) .
Find the `username` by going to the user Profile under the `/perfil` url:

_Example:_
In [https://www.mercadolibre.com.ar/perfil/FRAVEGA](https://www.mercadolibre.com.ar/perfil/FRAVEGA) the `username` is `FRAVEGA`.

## Create Product Pages

This is an example of how you can automatically generate product pages.

#### 1 - Create Pages:

Insert the following code into the file `gatsby-node.js`.

```javascript
const path = require("path");

exports.createPages = ({ graphql, actions }) => {
  const { createPage } = actions;

  return new Promise((resolve, reject) => {
    const productTemplate = path.resolve(`./src/templates/product.js`);
    resolve(
      graphql(
        `
          {
            allMercadoLibreProduct {
              edges {
                node {
                  id
                }
              }
            }
          }
        `
      )
        .then(result => {
          if (result.errors) {
            reject(result.errors);
          }
          result.data.allMercadoLibreProduct.edges.forEach(({ node }) => {
            const path = `/producto/${node.id}`;
            createPage({
              path,
              component: productTemplate,
              context: {
                id: node.id
              }
            });
          });
        })
        .catch(err => console.log("Error creating product pages ", err))
    );
  });
};
```

#### 2 - Consume product data from the template:

In `src/templates/product.js` use this query:

```graphql
export const productQuery = graphql`
  query Producto($id: String!) {
    mercadoLibreProduct(id: { eq: $id }) {
      id
      title
      price
      video_id
      permalink
      itemDescription
      accepts_mercadopago
      available_quantity
      itemImages {
        image {
          childImageSharp {
            fluid(maxWidth: 600, maxHeight: 250) {
              ...GatsbyImageSharpFluid
            }
          }
        }
      }
    }
  }
`
```

---

### Other GraphQL Queries

#### Get all Products

```graphql
allMercadoLibreProduct {
  edges {
    node {
      id
      title
      fields {
        slug
      }
      domain_id
      price
      currency_id
      itemThumbnail {
        image {
          childImageSharp {
            fluid(maxWidth: 400, maxHeight: 250) {
              ...GatsbyImageSharpFluid
            }
          }
        }
      }
    }
  }
}
```

#### Get product by MercadoLibre ID

Note that the `id` field is a GraphQL internal ID. The _ML_ ID is stored under `itemID`

Example: [https://articulo.mercadolibre.com.ar/MLA-736407313-smart-tv-55-full-hd-samsung-un55k5500-\_JM](https://articulo.mercadolibre.com.ar/MLA-736407313-smart-tv-55-full-hd-samsung-un55k5500-_JM) would be queried as:

```graphql
{
  allMercadoLibreProduct(filter: { itemID: { eq: "MLA736407313" } }) {
    edges {
      node {
        title
      }
    }
  }
}
```

#### Get products by Category

```graphql
{
  allMercadoLibreProduct(filter: { domain_id: { eq: "MLA-TELEVISIONS" } }) {
    edges {
      node {
        title
      }
    }
  }
}
```

## Gatsby Theme
We launched a [gatsby theme](https://github.com/florantara/gatsby-theme-mercadolibre-store) that uses this plugin.