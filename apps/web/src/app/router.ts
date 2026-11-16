import { createRouter, createWebHistory } from 'vue-router';

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
