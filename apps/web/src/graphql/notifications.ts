import { gql } from '@apollo/client'

const NOTIFICATION_FIELDS = gql`
  fragment NotificationFields on Notification {
    id type title body is_read created_at
    priority entityRef entityType entityId projectId
  }
`

export const NOTIFICATIONS_QUERY = gql`
  ${NOTIFICATION_FIELDS}
  query MyNotifications($is_read: Boolean, $limit: Int) {
    notifications(is_read: $is_read, limit: $limit) { ...NotificationFields }
    unreadNotificationCount
  }
`

export const MARK_NOTIFICATION_READ = gql`
  ${NOTIFICATION_FIELDS}
  mutation MarkNotificationRead($id: ID!) {
    markNotificationRead(id: $id) { ...NotificationFields }
  }
`

export const MARK_ALL_NOTIFICATIONS_READ = gql`
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`
