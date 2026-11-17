import { createRouter, createWebHistory } from 'vue-router';
import { SECTIONS as CATALOG_SECTIONS } from '@/features/catalog/entities';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/features/home/HomePage.vue') },
    {
      path: '/iniciar-sesion',
      name: 'login',
      component: () => import('@/features/auth/LoginPage.vue'),
      meta: { public: true, bare: true },
    },
    {
      path: '/cambiar-contrasena',
      name: 'change-password',
      component: () => import('@/features/auth/ChangePasswordPage.vue'),
      meta: { allowPendingPassword: true },
    },
    {
      path: '/activos',
      name: 'assets',
      component: () => import('@/features/assets/AssetsPage.vue'),
      meta: { permissions: ['asset:read'] },
    },
    {
      path: '/activos/nuevo',
      name: 'asset-new',
      component: () => import('@/features/assets/AssetFormPage.vue'),
      meta: { permissions: ['asset:write'] },
    },
    {
      path: '/activos/:id',
      name: 'asset',
      component: () => import('@/features/assets/AssetDetailPage.vue'),
      meta: { permissions: ['asset:read'] },
    },
    {
      path: '/activos/:id/editar',
      name: 'asset-edit',
      component: () => import('@/features/assets/AssetFormPage.vue'),
      meta: { permissions: ['asset:write'] },
    },
    // La URL siempre lleva la sección visible: `/catalogo` o una sección desconocida van a la primera.
    {
      path: '/catalogo/:rest(.*)?',
      redirect: (to) => ({ path: `/catalogo/${CATALOG_SECTIONS[0]}`, query: to.query }),
    },
    {
      path: `/catalogo/:section(${CATALOG_SECTIONS.join('|')})`,
      name: 'catalog',
      component: () => import('@/features/catalog/CatalogPage.vue'),
      meta: { permissions: ['asset:read'] },
    },
    {
      path: '/usuarios',
      name: 'users',
      component: () => import('@/features/users/UsersPage.vue'),
      meta: { permissions: ['user:manage'] },
    },
    {
      path: '/roles',
      name: 'roles',
      component: () => import('@/features/roles/RolesPage.vue'),
      meta: { permissions: ['role:manage'] },
    },
    {
      path: '/auditoria',
      name: 'audit',
      component: () => import('@/features/audit/AuditPage.vue'),
      meta: { permissions: ['audit:read'] },
    },
    {
      path: '/sin-permiso',
      name: 'forbidden',
      component: () => import('@/features/home/ForbiddenPage.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/features/home/NotFoundPage.vue'),
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
