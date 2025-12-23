import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import BottomNav from './BottomNav'
import { useEffect, useState } from 'react'

export default function Layout() {
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Top navbar - always visible */}
      <Navbar />
      
      {/* Main content */}
      <main className={`${isMobile ? 'pb-32' : 'pb-8'}`}>
        <Outlet />
      </main>
      
      {/* Bottom navigation - mobile only */}
      {isMobile && <BottomNav />}
    </div>
  )
}
