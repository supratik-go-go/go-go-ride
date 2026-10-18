// Reusable admin-panel pieces. Import from here:
//   import { KpiCard, ChartCard, TimeSeriesChart, DonutChart, DateRangePicker } from '../../components/admin'
//
// Each component imports ./admin-ui.css itself (classes are prefixed `adm-`),
// so nothing else needs to be loaded to use them.

export { KpiCard, Trend } from './KpiCard'
export { ChartCard } from './ChartCard'
export { TimeSeriesChart } from './TimeSeriesChart'
export { DonutChart } from './DonutChart'
export { DateRangePicker } from './DateRangePicker'
export { Drawer } from './Drawer'
export { AdminTabs } from './AdminTabs'
export { ApprovalActions } from './ApprovalActions'
export { BusRequestDetails, DocumentGrid, StopageTimeline, ServiceDays, DetailSection } from './BusRequestDetails'
export { BusReviewDrawer } from './BusReviewDrawer'
export { BusDetailsModal } from './BusDetailsModal'
export { UserDrawer, LoginStatus } from './UserDrawer'
export { RoleBadge } from './RoleBadge'
export { ActivityList } from './ActivityList'
export { TopRoutesList } from './TopRoutesList'
export { useStatusCounts } from './useStatusCounts'
export { DateTimeCell } from './Cells'
export {
  shortDate,
  formatRange,
  firstName,
  routeLabel,
  computeTrend,
  RANGE_PRESETS,
  presetRange,
  rangeDays,
  previousRange,
  trendLabelFor,
  rangeParams,
  compactNumber,
  deviceLabel,
  isImageFile,
  CHART_COLORS,
  ROLE_TONE,
  activityMeta,
  BUS_REQUESTS_CHANGED_EVENT,
} from './adminUtils'
