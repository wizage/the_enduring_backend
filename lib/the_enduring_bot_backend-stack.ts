import { Stack, StackProps, aws_dynamodb, aws_ec2, aws_ecs, aws_iam, aws_elasticloadbalancingv2, Duration, aws_logs, aws_ssm, aws_autoscaling} from 'aws-cdk-lib';
import { SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class TheEnduringBotBackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const userTable = new aws_dynamodb.Table(this, 'UserTable', {
      tableName: 'userTable',
      partitionKey: { 
        name: 'discordId', 
        type: aws_dynamodb.AttributeType.STRING
      },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    userTable.addGlobalSecondaryIndex({
      indexName: 'runescapeName',
      partitionKey: {
        name: 'runescapeName',
        type: aws_dynamodb.AttributeType.STRING,
      }
    });

    const defaultVPC = new aws_ec2.Vpc(this, 'ContainerVPC', {
      natGateways:0,
    });
    const botCluster = new aws_ecs.Cluster(this, 'BotCluster', { vpc:defaultVPC });


    // botCluster.addCapacity('BotCap', {
    //   instanceType: aws_ec2.InstanceType.of(aws_ec2.InstanceClass.T2, aws_ec2.InstanceSize.MICRO),
    //   vpcSubnets: {subnetType: SubnetType.PUBLIC},
    //   maxCapacity: 3,
    //   minCapacity: 1,
      
    // });

    const autoScalingGroup = new aws_autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc: defaultVPC,
      instanceType: new aws_ec2.InstanceType('t2.micro'),
      machineImage: aws_ecs.EcsOptimizedImage.amazonLinux2(),
      minCapacity: 1,
      maxCapacity: 3,
      vpcSubnets: {subnetType: SubnetType.PUBLIC},
    });

    const capacityProvider = new aws_ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      autoScalingGroup,
    });
    botCluster.addAsgCapacityProvider(capacityProvider);

    const execRole = new aws_iam.Role(this, 'bottyExec-', {
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com')
    })
    execRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'))

    const containerTaskRole = new aws_iam.Role(this, 'bottyRules', {
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com')
    });

    containerTaskRole.addManagedPolicy(aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'));
    const taskDef = new aws_ecs.Ec2TaskDefinition(this, 'TaskDef', {
      taskRole: containerTaskRole,
      executionRole: execRole,
    });

    const discordToken = aws_ssm.StringParameter.fromSecureStringParameterAttributes(this, 'DISCORDTOKEN', {
      parameterName: "DISCORDTOKEN",
      version: 1
    });

    const container = taskDef.addContainer('botty',
      {
        image: aws_ecs.ContainerImage.fromRegistry(`${Stack.of(this).account}.dkr.ecr.${Stack.of(this).region}.amazonaws.com/botty_repo:botty`),
        memoryLimitMiB: 700,
        entryPoint: ['node','build/main.js'],
        secrets:{
          DISCORDTOKEN:aws_ecs.Secret.fromSsmParameter(discordToken),
        },
        environment: {
          NODE_PATH:	"./build",
          NODE_VERSION:	"16.13.2",
          PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
          YARN_VERSION:	"1.22.15"
        },
        workingDirectory: "/home/node/app",
        logging: aws_ecs.LogDriver.awsLogs({streamPrefix: 'BottyLogs-', logRetention: aws_logs.RetentionDays.FIVE_DAYS})
      },
    );

    
    container.addPortMappings({
      containerPort: 80,
      hostPort: 80,
      protocol: aws_ecs.Protocol.TCP
    });
    
    const service = new aws_ecs.Ec2Service(this, 'Service', {
      cluster: botCluster,
      taskDefinition: taskDef,
      capacityProviderStrategies: [
        {
          capacityProvider: capacityProvider.capacityProviderName,
          weight: 1,
        }
      ]
    });

    const lb = new aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'LB', {
      vpc: defaultVPC,
      internetFacing: true
    });
    const listener = lb.addListener('PublicListener', { port: 80, open: true });
    
    listener.addTargets('ECS', {
      port: 80,
      targets: [autoScalingGroup],
      healthCheck: {
        interval: Duration.seconds(60),
        path: "/health",
        timeout: Duration.seconds(5),
      }
    });
  }
}
