import Sidebar from "./Sidebar";

const Layout = ({ children }) => {
  return (
    <div className="flex">
      <Sidebar />
     <main className="ml-72 p-6 w-full bg-slate-100 min-h-screen">

        {children}
      </main>
    </div>
  );
};

export default Layout;
