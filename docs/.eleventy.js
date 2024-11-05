module.exports = function(eleventyConfig) {
    eleventyConfig.addPassthroughCopy("assets");

    eleventyConfig.setTemplateFormats([
        "md",
        "njk",
        "html",
        "css", // include CSS files
        "png",
        "jpg",
        "jpeg",
        "gif",
        "js"  // include JS files
      ]);

    return {
      dir: {
        input: ".",
        output: "_site"
      }
    };
  };