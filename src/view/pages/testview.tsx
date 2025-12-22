import { Layout } from '../layouts/main_layout.tsx'

export const TestView = () => {
  return (
    <Layout title="TestView">
      <div class="p-8 text-center">
        <h1 class="text-3xl font-bold">Page: TestView</h1>
        <p class="text-slate-500 mt-2">Edit me in src/view/pages/testview.tsx</p>
      </div>
    </Layout>
  )
}
