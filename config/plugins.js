const crypto = require("crypto");

let pluginConfig = {
  seo: {
    enabled: true,
  },
  "users-permissions": {
    config: {
      jwt: {
        jwtSecret: crypto.randomBytes(16).toString("base64"),
        expiresIn: "7d",
      },
    },
  },
};

module.exports = ({ env }) => {
  if (env("NODE_ENV") === "production") {
    pluginConfig = {
      ...pluginConfig,
      upload: {
        config: {
          provider: "cloudinary",
          providerOptions: {
            cloud_name: env("CLOUDINARY_NAME"),
            api_key: env("CLOUDINARY_KEY"),
            api_secret: env("CLOUDINARY_SECRET"),
          },
        },
      },
    };
  }

  return pluginConfig;
};
