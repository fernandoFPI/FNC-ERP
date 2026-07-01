import { gql } from '@apollo/client'

export const MY_PROFILE_QUERY = gql`
  query MyProfile {
    myProfile {
      id
      email
      mfaEnabled
      lastLogin
      createdAt
    }
  }
`

export const MY_PREFERENCES_QUERY = gql`
  query MyPreferences {
    myPreferences {
      themePreference
      dateFormat
      numberFormat
      notificationPreferences
    }
  }
`

export const MY_SESSIONS_QUERY = gql`
  query MySessions {
    mySessions {
      id
      deviceName
      platform
      ipAddress
      createdAt
      lastActive
      isCurrent
    }
  }
`

export const UPDATE_PASSWORD = gql`
  mutation UpdatePassword($currentPassword: String!, $newPassword: String!) {
    updatePassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`

export const UPDATE_PREFERENCES = gql`
  mutation UpdatePreferences($input: PreferencesInput!) {
    updatePreferences(input: $input) {
      themePreference
      dateFormat
      numberFormat
      notificationPreferences
    }
  }
`

export const ENABLE_MFA = gql`
  mutation EnableMFA {
    enableMFA {
      secret
      otpauthUrl
    }
  }
`

export const CONFIRM_MFA = gql`
  mutation ConfirmMFA($totpCode: String!) {
    confirmMFA(totpCode: $totpCode)
  }
`

export const DISABLE_MFA = gql`
  mutation DisableMFA($password: String!) {
    disableMFA(password: $password)
  }
`

export const REVOKE_MY_SESSION = gql`
  mutation RevokeMySession($sessionId: ID!) {
    revokeMySession(sessionId: $sessionId)
  }
`

export const REVOKE_ALL_MY_SESSIONS = gql`
  mutation RevokeAllMySessions {
    revokeAllMySessions
  }
`
