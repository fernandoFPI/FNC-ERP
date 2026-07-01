import React from 'react'
import ReactDOM from 'react-dom/client'
import { ApolloProvider } from '@apollo/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { ThemeProvider } from './theme/ThemeContext'
import { apolloClient } from './lib/apollo'
import { queryClient } from './lib/queryClient'
import { router } from './router'
import './theme/themes.css'

const root = document.getElementById('root')
if (!root) throw new Error('No #root element found')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ApolloProvider client={apolloClient}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryClientProvider>
    </ApolloProvider>
  </React.StrictMode>
)
