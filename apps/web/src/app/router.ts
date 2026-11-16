import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/features/home/HomePage.vue') },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/features/home/NotFoundPage.vue'),
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
