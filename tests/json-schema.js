const Ajv = require('ajv');
const config = require('../config.json');
const schema = require('../configSchema.json');
const assert = require('assert');

const ajv = new Ajv();

describe('Config Validation', () => {
  it('should validate the config against the schema', () => {
    const validate = ajv.compile(schema);
    const valid = validate(config);
    if (!valid) {
      console.error(validate.errors);
    }
    assert.strictEqual(valid, true, "Config does not match the schema");
  });
});
