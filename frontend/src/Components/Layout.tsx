import { Outlet } from 'react-router-dom';
import NavBar from './NavBar';

export default function Layout() {
  return (
    <div className="min-h-screen text-blue-400 font-serif">
      <NavBar />
      <div className=''>
      <Outlet />
      </div>
    </div>
  );
}