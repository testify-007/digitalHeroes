export default function DashboardLoading() {
  return (
    <div className="min-h-screen pt-20 pb-16">
      <div className="section py-8">
        <div className="skeleton h-9 w-64 mb-2" />
        <div className="skeleton h-5 w-40 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="skeleton h-40 rounded-2xl" />
            <div className="skeleton h-56 rounded-2xl" />
          </div>
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="skeleton h-48 rounded-2xl" />
            <div className="skeleton h-64 rounded-2xl" />
            <div className="skeleton h-48 rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  )
}
