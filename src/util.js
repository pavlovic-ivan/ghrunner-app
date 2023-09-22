const fs = require('fs');
const yaml = require('js-yaml');

function convertYamlToJson(yamlFilePath) {
    try {
        const fileContents = fs.readFileSync(yamlFilePath, 'utf8');
        const data = yaml.load(fileContents);

        return JSON.stringify(data, null, 2);
    } catch (e) {
        console.error('Error reading or parsing YAML:', e);
        throw e;
    }
}

module.exports = { convertYamlToJson };
