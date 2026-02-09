import Sidebar from "./Sidebar";

const Layout = ({ children }) => {
  return (
    <div className="flex">
      <Sidebar />
     <main
        className="p-6 w-full bg-slate-100 min-h-screen transition-[margin] duration-200"
        style={{ marginLeft: "var(--sidebar-width, 18rem)" }}
      >

        {children}
      </main>
    </div>
  );
};

export default Layout;
