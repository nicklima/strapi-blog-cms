"use strict";

const fs = require("fs");
const mime = require("mime-types");
const set = require("lodash.set");
const { categories, writers, articles, global } = require("../data/data.json");

const isFirstRun = async () => {
  const pluginStore = strapi.store({
    environment: strapi.config.environment,
    type: "type",
    name: "setup",
  });
  const initHasRun = await pluginStore.get({ key: "initHasRun" });
  await pluginStore.set({ key: "initHasRun", value: true });
  return !initHasRun;
};

const setPublicPermissions = async (newPermissions) => {
  // Find the ID of the public role
  const publicRole = await strapi
    .query("plugin::users-permissions.role")
    .findOne({
      where: {
        type: "public",
      },
    });

  // Create the new permissions and link them to the public role
  const allPermissionsToCreate = [];
  Object.keys(newPermissions).map((controller) => {
    const actions = newPermissions[controller];
    const permissionsToCreate = actions.map((action) => {
      return strapi.query("plugin::users-permissions.permission").create({
        data: {
          action: `api::${controller}.${controller}.${action}`,
          role: publicRole.id,
        },
      });
    });
    allPermissionsToCreate.push(...permissionsToCreate);
  });
  await Promise.all(allPermissionsToCreate);
};

const getFileSizeInBytes = (filePath) => {
  const stats = fs.statSync(filePath);
  const fileSizeInBytes = stats["size"];
  return fileSizeInBytes;
};

const getFileData = (fileName) => {
  const filePath = `./data/uploads/${fileName}`;

  // Parse the file metadata
  const size = getFileSizeInBytes(filePath);
  const ext = fileName.split(".").pop();
  const mimeType = mime.lookup(ext);

  return {
    path: filePath,
    name: fileName,
    size,
    type: mimeType,
  };
};

// Create an entry and attach files if there are any
const createEntry = async ({ model, entry, files }) => {
  try {
    if (files) {
      for (const [key, file] of Object.entries(files)) {
        // Get file name without the extension
        const [fileName] = file.name.split(".");
        // Upload each individual file
        const uploadedFile = await strapi
          .plugin("upload")
          .service("upload")
          .upload({
            files: file,
            data: {
              fileInfo: {
                alternativeText: fileName,
                caption: fileName,
                name: fileName,
              },
            },
          });

        // Attach each file to its entry
        set(entry, key, uploadedFile[0].id);
      }
    }

    // Actually create the entry in Strapi
    const createdEntry = await strapi.entityService.create(
      `api::${model}.${model}`,
      {
        data: entry,
      }
    );
  } catch (e) {
    console.log("model", entry, e);
  }
};

// Create first user admin
const createAdminUser = async () => {
  if (process.env.ADMIN_CREATE === "false") {
    console.log(
      `CREATE_ADMIN option is defined as ${process.env.ADMIN_CREATE} in env config. Skiping user creation`
    );
    return;
  }

  // Check if admin user exists
  const hasAdmin = await strapi.service("admin::user").exists();
  if (hasAdmin) {
    return;
  }

  // Check is super admin role exists
  let superAdminRole = await strapi.service("admin::role").getSuperAdmin();
  if (!superAdminRole) {
    try {
      console.log("Role does not exists, creating role");
      await strapi.service("admin::role").create({
        name: "Super Admin",
        code: "strapi-super-admin",
        description:
          "Super Admins can access and manage all features and settings.",
      });
    } catch (error) {
      console.log("Could not create admin role...");
      console.error(error);
    }

    superAdminRole = await strapi.service("admin::role").getSuperAdmin();
    if (!superAdminRole) {
      console.log("can't create the role. Skiping user creation...");
      return;
    }
  }

  try {
    // Create admin account
    console.log("Setting up admin user...");
    await strapi.service("admin::user").create({
      username: process.env.ADMIN_USERNAME,
      email: process.env.ADMIN_EMAIL,
      firstname: process.env.ADMIN_FN,
      lastname: process.env.ADMIN_LN,
      password: process.env.ADMIN_PASS,
      isActive: true,
      blocked: false,
      registrationToken: null,
      roles: superAdminRole ? [superAdminRole.id] : [],
    });
    console.info("Admin Account created...");
  } catch (error) {
    console.log("Could not create admin user...");
    console.error(error);
  }
};

async function importCategories() {
  return Promise.all(
    categories.map((category) => {
      return createEntry({ model: "category", entry: category });
    })
  );
}

async function importWriters() {
  return Promise.all(
    writers.map(async (writer) => {
      const files = {
        picture: getFileData(`${writer.email}.jpg`),
      };
      return createEntry({
        model: "writer",
        entry: writer,
        files,
      });
    })
  );
}

async function importArticles() {
  return Promise.all(
    articles.map((article) => {
      const files = {
        image: getFileData(`${article.slug}.jpg`),
      };

      return createEntry({
        model: "article",
        entry: {
          ...article,
          // Make sure it's not a draft
          publishedAt: Date.now(),
        },
        files,
      });
    })
  );
}

// Create Globals SEO data
const importGlobal = async () => {
  const files = {
    favicon: getFileData("favicon.png"),
    "defaultSeo.shareImage": getFileData("default-image.png"),
  };
  return createEntry({ model: "global", entry: global, files });
};

// Call Import data functions
const importSeedData = async () => {
  // Allow read of application content types
  await setPublicPermissions({
    global: ["find"],
    article: ["find", "findOne"],
    category: ["find", "findOne"],
    writer: ["find", "findOne"],
  });

  console.log("Bootstraping data...");
  // Create all entries
  await importCategories();
  await importWriters();
  await importArticles();
  await importGlobal();
};

// Run bootstrap functions
module.exports = async () => {
  const shouldImportSeedData = await isFirstRun();

  if (shouldImportSeedData) {
    console.log("First install, let's check if we have to create some data...");
    await createAdminUser();

    // Check if is first run and if BOOTSTRAP_CONTENT env var is true
    if (process.env.BOOTSTRAP_CONTENT === "true") {
      try {
        console.log("Setting up the template...");
        await importSeedData();
        console.log("Ready to go!");
      } catch (error) {
        console.log("Could not import seed data...");
        console.error(error);
      }
    }
  }
};
