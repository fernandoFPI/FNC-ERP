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

export const GET_USER_PO_POSITIONS = gql`
  query GetUserPOPositions($userId: ID!) {
    userPOPositions(userId: $userId) {
      id
      employeeId
      employeeName
      position
      projectId
      projectName
      departmentId
      departmentName
      isActive
      createdAt
    }
  }
`
