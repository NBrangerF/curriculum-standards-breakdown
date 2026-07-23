import { AfricanStorybookConnector } from './african-storybook.mjs'
import { BookDashConnector } from './bookdash.mjs'
import { CsUnpluggedConnector } from './cs-unplugged.mjs'
import { MdnZhCnConnector } from './mdn-zh-cn.mjs'
import { OakConnector } from './oak.mjs'
import { RaspberryPiLearningConnector } from './raspberry-pi-learning.mjs'
import { SiyavulaConnector } from './siyavula.mjs'

const CONNECTORS = {
  'african-storybook': AfricanStorybookConnector,
  bookdash: BookDashConnector,
  'cs-unplugged': CsUnpluggedConnector,
  'mdn-zh-cn': MdnZhCnConnector,
  oak: OakConnector,
  'raspberry-pi-learning': RaspberryPiLearningConnector,
  siyavula: SiyavulaConnector
}

export function createConnector(source, options = {}) {
  const Connector = CONNECTORS[source.connector]
  if (!Connector) throw new Error(`Unknown learning resource connector: ${source.connector}`)
  return new Connector(source, options)
}

export const connectorIds = Object.keys(CONNECTORS)

