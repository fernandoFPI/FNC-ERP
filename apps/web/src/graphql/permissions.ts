import { gql } from '@apollo/client'

export const GET_USER_PERMISSIONS = gql`
  query GetUserPermissions($userId: ID!, $companyId: ID!) {
    userPermissions(userId: $userId, companyId: $companyId) {
      userId
      companyId
      isAdmin
      permissions {
        key
        label
        module
        submodule
        accessLevel
      }
    }
  }
`

export const GET_USER_COMPANIES = gql`
  query GetUserCompanies($userId: ID!) {
    userCompanies(userId: $userId) {
      id
      name
    }
  }
`

export const SAVE_USER_PERMISSIONS = gql`
  mutation SaveUserPermissions($input: SaveUserPermissionsInput!) {
    saveUserPermissions(input: $input) {
      userId
      companyId
      isAdmin
      permissions {
        key
        accessLevel
      }
    }
  }
`

export const GET_ROLE_TEMPLATES = gql`
  query GetRoleTemplates {
    roleTemplates {
      id
      name
      description
      isSystem
      createdAt
      permissions {
        key
        accessLevel
      }
    }
  }
`

export const GET_ROLE_TEMPLATE = gql`
  query GetRoleTemplate($id: ID!) {
    roleTemplate(id: $id) {
      id
      name
      description
      isSystem
      createdAt
      permissions {
        key
        accessLevel
      }
    }
  }
`

export const CREATE_ROLE_TEMPLATE = gql`
  mutation CreateRoleTemplate($input: RoleTemplateInput!) {
    createRoleTemplate(input: $input) {
      id
      name
      description
      isSystem
      createdAt
      permissions {
        key
        accessLevel
      }
    }
  }
`

export const UPDATE_ROLE_TEMPLATE = gql`
  mutation UpdateRoleTemplate($id: ID!, $input: RoleTemplateInput!) {
    updateRoleTemplate(id: $id, input: $input) {
      id
      name
      description
      isSystem
      createdAt
      permissions {
        key
        accessLevel
      }
    }
  }
`

export const DELETE_ROLE_TEMPLATE = gql`
  mutation DeleteRoleTemplate($id: ID!) {
    deleteRoleTemplate(id: $id)
  }
`

export const PERMISSIONS_CHANGED_SUBSCRIPTION = gql`
  subscription OnPermissionsChanged($userId: ID!) {
    permissionsChanged(userId: $userId) {
      userId
      companyId
    }
  }
`

// Whether this user's purchases at Items Bought need the requisition organizer's approval (migration 316).
export const GET_USER_PURCHASE_REVIEW = gql`
  query GetUserPurchaseReview($userId: ID!, $companyId: ID) {
    userPurchaseReview(userId: $userId, companyId: $companyId)
  }
`

export const SET_USER_PURCHASE_REVIEW = gql`
  mutation SetUserPurchaseReview($userId: ID!, $required: Boolean!, $companyId: ID) {
    setUserPurchaseReview(userId: $userId, required: $required, companyId: $companyId)
  }
`

export const GET_USER_PO_POSITIONS = gql`
  query GetUserPOPositions($userId: ID!, $companyId: ID) {
    userPOPositions(userId: $userId, companyId: $companyId) {
      id
      employeeId
      employeeName
      position
      projectId
      projectName
      departmentId
      departmentName
      branchId
      branchName
      isActive
      createdAt
    }
  }
`
