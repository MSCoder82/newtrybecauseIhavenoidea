

import React from 'react';
import { NavItem, View } from '../types';
import { UsaceLogoIcon, XMarkIcon } from './Icons';

interface SidebarProps {
  navigationItems: NavItem[];
  activeView: View;
  setActiveView: (view: View) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ navigationItems, activeView, setActiveView, isOpen = true, onClose }) => {
  const handleNavigate = (view: View) => {
    setActiveView(view);
    if (onClose) {
      onClose();
    }
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col bg-usace-blue text-white shadow-xl transition-transform duration-300 ease-in-out lg:static lg:z-auto lg:translate-x-0 lg:flex-shrink-0 lg:shadow-none ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      <div className="relative flex h-16 items-center justify-center border-b border-navy-600 p-4">
        <div className="flex items-center space-x-3">
          <UsaceLogoIcon className="h-8 w-8 text-usace-red" />
          <span className="font-bold text-lg tracking-wider">USACE</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-2 text-navy-100 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white lg:hidden"
            aria-label="Close navigation"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-6">
        {navigationItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleNavigate(item.id)}
            className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors duration-200 ${
              activeView === item.id
                ? 'bg-usace-red text-white'
                : 'text-navy-100 hover:bg-navy-700 hover:text-white'
            }`}
          >
            <item.icon className="mr-3 h-5 w-5" />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="border-t border-navy-600 p-4">
        <p className="text-center text-xs text-navy-300">&copy; 2024 USACE PAO</p>
      </div>
    </aside>
  );
};

export default Sidebar;