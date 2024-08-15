const sinon = require('sinon');
const assert = require('assert');
const { Probot } = require('probot');
const probotApp = require('../src/app');
const pulumi = require('@pulumi/pulumi');


const fs = require('fs');
const mockPayload = JSON.parse(fs.readFileSync('tests/workflow_job.completed.json', 'utf8'));

describe('probotApp', () => {
  let probot;

  beforeEach(() => {
    sinon.stub(pulumi, 'stack select').value({
      select: sinon.fake.resolves(true) // Mocking the select method as an example
    });

    probot = new Probot({
      appId: "123456",
      privateKey: "fake"
    });
    const app = probot.load(probotApp);
  });

  afterEach(() => {
    sinon.restore(); // Restore the original behavior after each test
  });

  describe('on workflow_job event', () => {
    it('should log message when job labels includes cuda', async () => {
      const consoleSpy = sinon.spy(console, 'info');
      await probot.receive({ name: 'workflow_job', payload: mockPayload, id: "123456" });
      assert.strictEqual(consoleSpy.called, true);
      consoleSpy.restore();
    });
  });
});