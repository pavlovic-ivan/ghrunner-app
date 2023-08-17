const chai = require('chai');
const assert = chai.assert;
const { createInstance } = require('../infra/instance');

describe('Instance Tests', function() {
    it('should create a non-null EC2 instance', function() {
        const identity = {
            accountId: "accountId"
        };
        const securityGroup = {
            id: "sg-id"
        };
        const script = "#!/bin/bash\necho 'Sample Script'";
        const config = {
            machineImage: "ami",
            machineType: "t2.micro",
            repo: "sample-repo",
            bootDiskSizeInGB: 8,
            bootDiskType: "gp2"
        };

        const instance = createInstance(identity, securityGroup, script, config);
        
        assert.isNotNull(instance, 'Instance should not be null');
    });
});
