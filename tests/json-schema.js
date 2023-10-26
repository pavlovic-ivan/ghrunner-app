const Ajv = require('ajv');
const schema = require('../configSchema.json');
const assert = require('assert');
const { convertYamlToJson } = require('../src/util');

const ajv = new Ajv();

describe('Config Validation', () => {
  it('should validate the config against the schema', () => {
    const validate = ajv.compile(schema);
    const config = convertYamlToJson('config.yml');
    const valid = validate(config);

    if (!valid) {
      console.error(validate.errors);
    }
    assert.strictEqual(valid, true, "Config does not match the schema");
  });
});
