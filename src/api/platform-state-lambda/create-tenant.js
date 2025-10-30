import { createLogger } from '~/src/helpers/logging/logger'
import { platformState } from '~/src/api/platform-state-lambda/platform-state'
import { environmentMappings } from '~/src/config/environments'
import crypto from 'node:crypto'

const logger = createLogger()

/**
 *
 * @param {string} name
 * @param {{ redis_enabled: boolean, mongo_enabled: boolean, team: string, service_code: string, type: string, subtype: string }} config
 */
function createTenant(name, config) {
  for (const env of Object.keys(platformState)) {
    if (platformState[env][name]) {
      logger.warn(`Service ${name} already exists in ${env}`)
      continue
    }

    platformState[env][name] = createTenantState(name, config, env)
    logger.info(`Added ${name} to ${env}`)
  }
}

/**
 * @typedef {Object} UrlConfig
 * @property {string} url
 * @property {boolean} shuttered
 * @property {boolean} enabled
 * @property {('internal'|'vanity')} type
 * @property {string} env
 *
 * @param {string} name
 * @param {UrlConfig} urlConfig
 */
function addUrl(name, urlConfig) {
  const { env } = urlConfig

  if (!platformState[env][name]) {
    logger.warn(`Service not found ${name} in ${env}`)
    return
  }

  const existingUrls = platformState[env][name].tenant.urls ?? {}

  platformState[env][name].tenant.urls = {
    ...existingUrls,
    [urlConfig.url]: {
      type: urlConfig.type,
      enabled: urlConfig.enabled,
      shuttered: urlConfig.shuttered
    }
  }

  logger.info(`Added url ${urlConfig.url} to ${env}/${name}`)
}

/**
 *
 * @param {string} name
 * @param {string[]} envs
 * @param {{ name: string, fifo_queue: string, content_based_deduplication, subscriptions: string[] }} config
 */
function addQueue(name, envs, config) {
  for (const env of envs) {
    if (!platformState[env][name]) {
      logger.warn(`Service not found ${name} in ${env}`)
      return
    }

    const queue = {
      arn: `arn:aws:sqs:eu-west-2:${environmentMappings[env]}:${config.name}`,
      name: config.name,
      url: `https://sqs.eu-west-2.amazonaws.com/${environmentMappings[env]}/${config.name}`,
      fifo_queue: config.fifo_queue === 'true',
      content_based_deduplication: config.content_based_deduplication ?? false,
      receive_wait_time_seconds: 30,
      subscriptions: config.subscriptions ?? []
    }

    platformState[env][name].tenant.sqs_queues.push(queue)
    platformState[env][name].tenant.tenant_config.sqs_queues.push(config.name)

    logger.info(`Added queue ${config.name} to ${env}/${name}`)
  }
}

/**
 *
 * @param {string} name
 * @param {string[]} envs
 * @param {{ name: string, fifo_topic: string, content_based_deduplication, subscriptions: string[] }} config
 */
function addTopic(name, envs, config) {
  for (const env of envs) {
    if (!platformState[env][name]) {
      logger.warn(`Service not found ${name} in ${env}`)
      return
    }

    const topic = {
      arn: `arn:aws:sns:eu-west-2:${environmentMappings[env]}:${config.name}`,
      name: config.name,
      fifo_topic: config.fifo_topic === 'true',
      content_based_deduplication: config.content_based_deduplication ?? false
    }

    platformState[env][name].tenant.sns_topics.push(topic)
    platformState[env][name].tenant.tenant_config.sns_topics.push(config.name)

    logger.info(`Added topic ${config.name} to ${env}/${name}`)
  }
}

/**
 *
 * @param {string} name
 * @param {string[]} envs
 * @param {{ name: string, versioning?: string }} config
 */
function addBucket(name, envs, config) {
  for (const env of envs) {
    if (!platformState[env][name]) {
      logger.warn(`Service not found ${name} in ${env}`)
      return
    }

    const bucket = {
      arn: `arn:aws:s3:::${config.name}`,
      bucket_name: config.name,
      bucket_domain_name: `${config.name}.s3.eu-west-2.amazonaws.com`,
      versioning: config.versioning ?? 'Disabled'
    }

    platformState[env][name].tenant.s3_buckets.push(bucket)
    platformState[env][name].tenant.tenant_config.s3_buckets.push(config.name)

    logger.info(`Added bucket ${config.name} to ${env}/${name}`)
  }
}

/**
 *
 * @param {string} name
 * @param {string[]} envs
 */
function addSqlDatabase(name, envs) {
  for (const env of envs) {
    if (!platformState[env][name]) {
      logger.warn(`Service not found ${name} in ${env}`)
      return
    }

    const nameHash = crypto.createHash('md5').update(name).digest('hex')

    platformState[env][name].tenant.sql_database = {
      arn: `arn:aws:rds:eu-west-2:${environmentMappings[env]}:cluster:${name}`,
      endpoint: `${name}-${nameHash}.eu-west-2.rds.amazonaws.com`,
      reader_endpoint: `${name}.cluster-ro-${nameHash}.eu-west-2.rds.amazonaws.com`,
      name,
      port: 5432,
      engine_version: '16.8',
      engine: 'aurora-postgresql',
      database_name: name.replaceAll('-', '_')
    }
    platformState[env][name].tenant.tenant_config.sql_database = true

    logger.info(`Added sql database to ${env}/${name}`)
  }
}

// TODO: add helpers to add sqs/s3 etc so we can pre-configure some services with the correct state

function createTenantState(name, config, env) {
  return {
    tenant: {
      urls: {
        [`${name}.${env}.cdp-int.defra.cloud`]: {
          type: 'internal',
          enabled: false,
          shuttered: false
        }
      },
      ecr_repository: env === 'management' ? createECR(name) : null,
      s3_buckets: [],
      sqs_queues: [],
      sns_topics: [],
      sql_database: null,
      dynamodb: [],
      api_gateway: null,
      cognito_identity_pool: null,
      bedrock_ai: null,
      tenant_config: {
        redis: config.redis_enabled,
        mongo: config.mongo_enabled,
        s3_buckets: [],
        sqs_queues: [],
        sns_topics: [],
        dynamodb: [],
        sql_database: false,
        api_gateway: false,
        cognito_identity_pool: false,
        bedrock_ai: false,
        zone: config.zone
      },
      logs: {
        name,
        url: `https://logs.${env}.defra.cloud/_dashboards/app/dashboards#/view/${name}`
      },
      metrics: [],
      alerts: [],
      nginx: config.type === 'Microservice' ? createNginx(name, env) : null,
      squid: {
        ports: [80, 443],
        domains: [
          '.cdp-int.defra.cloud',
          '.amazonaws.com',
          'login.microsoftonline.com',
          'www.gov.uk',
          '.auth.eu-west-2.amazoncognito.com',
          '.browserstack.com',
          'api.notifications.service.gov.uk'
        ]
      }
    },
    metadata: {
      created: '2025-05-12T10:16:00.584Z',
      name,
      service_code: config.service_code,
      subtype: config.subtype,
      type: config.type,
      teams: [config.team]
    },
    progress: {
      complete: true,
      steps: {
        infra: true,
        logs: true,
        metrics: true,
        nginx: true,
        squid: true
      }
    }
  }
}

function createNginx(name, env) {
  return {
    servers: {
      [`${name}.${env}.cdp-int.defra.cloud`]: {
        name: `${name}.${env}.cdp-int.defra.cloud`,
        locations: {
          '/': {
            path: '/',
            params: {
              proxy_set_header: 'X-cdp-request-id $cdp_request_id',
              proxy_pass: `https://${name}`,
              proxy_pass_request_headers: 'on'
            }
          },
          '/upload-and-scan': {
            path: '/upload-and-scan',
            params: {
              client_max_body_size: '2304M',
              proxy_set_header: `Host cdp-uploader.${env}.cdp-int.defra.cloud`,
              proxy_pass: 'https://upload-for-virus-scanning/upload-and-scan',
              proxy_pass_request_headers: 'on'
            }
          }
        },
        settings: {
          listen: '443 ssl',
          server_tokens: 'off',
          server_name: `${name}.${env}.cdp-int.defra.cloud`,
          ssl_certificate: '/etc/nginx/ssl/cdp.crt',
          ssl_certificate_key: '/etc/nginx/ssl/cdp.key',
          ssl_protocols: 'TLSv1.2 TLSv1.3',
          keepalive_timeout: '0',
          add_header: 'X-cdp-request-id $cdp_request_id'
        }
      }
    }
  }
}

function createECR(name) {
  return {
    arn: `arn:aws:ecr:eu-west-2:${environmentMappings.management}:repository/${name}`,
    name,
    url: `000000000000.dkr.ecr.eu-west-2.amazonaws.com/${name}`
  }
}

export { createTenant, addQueue, addUrl, addTopic, addBucket, addSqlDatabase }
