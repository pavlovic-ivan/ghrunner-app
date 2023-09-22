const fs = require('fs');
const yaml = require('js-yaml');

function convertYamlToJson(yamlFilePath) {
    try {
        const fileContents = fs.readFileSync(yamlFilePath, 'utf8');
        return yaml.load(fileContents);
    } catch (e) {
        console.error('Error reading or parsing YAML:', e);
        throw e;
    }
}

module.exports = { convertYamlToJson };
