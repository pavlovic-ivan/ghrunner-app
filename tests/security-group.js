const chai = require('chai');
const assert = chai.assert;
const { createSecurityGroup } = require('../infra/security-group');

describe('Security Group Tests', function() {
    it('should create a non-null security group', function() {
        const repo = "sample-repo";

        const securityGroup = createSecurityGroup(repo);
        
        assert.isNotNull(securityGroup, 'Security group should not be null');
    });
});
