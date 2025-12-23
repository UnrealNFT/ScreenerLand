import { DefaultThemes, buildTheme } from '@make-software/csprclick-ui'

// Theme pour CSPR.click - utilise le theme par défaut
export const AppTheme = buildTheme({
  ...DefaultThemes.csprclick
})
