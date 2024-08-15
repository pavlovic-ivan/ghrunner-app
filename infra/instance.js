const aws = require("@pulumi/aws");
const pulumi = require("@pulumi/pulumi");
const { getTags } = require("./commons");
const { EC2Client, DescribeSpotPriceHistoryCommand } = require("@aws-sdk/client-ec2");

async function findBestAvailabilityZone(instanceType, region) {
    const client = new EC2Client({ region });

    const spotPriceHistory = await client.send(new DescribeSpotPriceHistoryCommand({
        InstanceTypes: [instanceType],
        ProductDescriptions: ['Linux/UNIX'],
        StartTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
    }));

    return spotPriceHistory.SpotPriceHistory
        .reduce((best, price) => {
            const currentPrice = parseFloat(price.SpotPrice);
            return (!best || currentPrice < best.price)
                ? { az: price.AvailabilityZone, price: currentPrice }
                : best;
        }, null).az;
}

const createInstance = (identity, securityGroup, script, config) => {
    const ami = aws.ec2.getAmiOutput({
        filters: [{
            name: "name",
            values: [ config.machineImage ],
        }],
        owners: [identity.accountId],
    });

    return new aws.ec2.Instance("ghrunner", {
        monitoring: true,
        ami: ami.id,
        instanceType: config.machineType,
        tags: getTags(config.repo),
        vpcSecurityGroupIds: [ securityGroup.id ],
        availabilityZone: pulumi.output(findBestAvailabilityZone(config.machineType, process.env.AWS_REGION)),
        userData: Buffer.from(script).toString("base64"),
        ebsBlockDevices: [{
            deviceName: "/dev/sda1",
            volumeSize: config.bootDiskSizeInGB,
            volumeType: config.bootDiskType
        }],
        instanceMarketOptions: {
            marketType: "spot"
        }
    });
}

module.exports = {
    createInstance
}