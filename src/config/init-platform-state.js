import { teams } from '~/src/api/github/content/teams-and-repos'
import {
  addBucket,
  addQueue,
  createTenant,
  addTopic,
  addSqlDatabase,
  addUrl
} from '~/src/api/platform-state-lambda/create-tenant'
import { environments } from '~/src/config/environments'

const defaultEntities = [
  {
    name: 'cdp-portal-frontend',
    zone: 'public',
    mongo: false,
    redis: true,
    service_code: 'CDP',
    team: teams[0].slug,
    type: 'Microservice',
    subtype: 'Frontend',
    urls: [
      {
        url: 'portal.cdp-int.defra.cloud',
        shuttered: false,
        enabled: false,
        type: 'vanity',
        env: 'management'
      },
      {
        url: 'portal-test.cdp-int.defra.cloud',
        shuttered: true,
        enabled: false,
        type: 'vanity',
        env: 'infra-dev'
      },
      {
        url: 'portal.defra.gov.uk',
        shuttered: false,
        enabled: true,
        type: 'vanity',
        env: 'management'
      }
    ]
  },
  {
    name: 'cdp-portal-backend',
    zone: 'protected',
    mongo: true,
    redis: false,
    service_code: 'CDP',
    team: teams[0].slug,
    type: 'Microservice',
    subtype: 'Backend',
    s3_buckets: [
      {
        name: 'cdp-portal-backend',
        versioning: 'Disabled'
      },
      {
        name: 'cdp-portal-backend-images',
        versioning: 'Disabled'
      }
    ],
    sqs_queues: [
      {
        name: 'message_clearance_request',
        fifo_queue: 'true',
        content_based_deduplication: false,
        subscriptions: ['error_notification.fifo']
      }
    ],
    sns_topics: [
      {
        name: 'decision_notification',
        cross_account_allow_list: [],
        fifo_topic: 'true',
        content_based_deduplication: false
      },
      {
        name: 'error_notification',
        cross_account_allow_list: [],
        fifo_topic: 'true',
        content_based_deduplication: false
      }
    ],
    urls: [
      {
        url: 'portal-backend.integration.api.defra.gov.uk',
        shuttered: false,
        enabled: false,
        type: 'vanity',
        env: 'ext-test'
      },
      {
        url: 'portal-backend.defra.gov.uk',
        shuttered: false,
        enabled: true,
        type: 'vanity',
        env: 'management'
      }
    ]
  },
  {
    name: 'cdp-self-service-ops',
    zone: 'protected',
    mongo: true,
    redis: false,
    service_code: 'CDP',
    team: teams[0].slug,
    type: 'Microservice',
    subtype: 'Backend'
  },
  {
    name: 'cdp-postgres-service',
    zone: 'protected',
    mongo: false,
    redis: false,
    service_code: 'CDP',
    team: teams[0].slug,
    type: 'Microservice',
    subtype: 'Backend',
    rds_aurora_postgres: [
      {
        instance_count: 1,
        min_capacity: 0.5,
        max_capacity: 4.0
      }
    ]
  },
  {
    name: 'tenant-backend',
    zone: 'protected',
    mongo: true,
    redis: false,
    service_code: 'CDP',
    team: teams[4].slug,
    type: 'Microservice',
    subtype: 'Backend',
    urls: [
      {
        url: 'tenant-backend.integration.api.defra.gov.uk',
        shuttered: false,
        enabled: false,
        type: 'internal',
        env: 'ext-test'
      },
      {
        url: 'tenant-backend.api.defra.gov.uk',
        shuttered: false,
        enabled: true,
        type: 'vanity',
        env: 'prod'
      }
    ]
  },
  {
    name: 'cdp-env-test-suite',
    zone: 'public',
    mongo: false,
    redis: false,
    test_suite: 'cdp-env-test-suite',
    service_code: 'CDP',
    type: 'TestSuite',
    subtype: 'Journey'
  }
]

function initPlatformState() {
  for (const entityConfig of defaultEntities) {
    createTenant(entityConfig.name, entityConfig)

    if (entityConfig.sqs_queues) {
      entityConfig.sqs_queues.forEach((queue) =>
        addQueue(entityConfig.name, environments, queue)
      )
    }

    if (entityConfig.sns_topics) {
      entityConfig.sns_topics.forEach((topic) =>
        addTopic(entityConfig.name, environments, topic)
      )
    }

    if (entityConfig.s3_buckets) {
      entityConfig.s3_buckets.forEach((bucket) =>
        // TODO: bucket names are unique per env, for now we just send the management one
        addBucket(entityConfig.name, ['management'], bucket)
      )
    }

    if (entityConfig.urls) {
      for (const urlConfig of entityConfig.urls) {
        addUrl(entityConfig.name, urlConfig)
      }
    }

    if (entityConfig.rds_aurora_postgres) {
      addSqlDatabase(entityConfig.name, environments)
    }
  }
}

export { initPlatformState }
