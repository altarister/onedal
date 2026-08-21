import React from 'react';

interface DropdownMenuProps {
  onClose: () => void;
}

export const InseongDropdownMenu: React.FC<DropdownMenuProps> = ({ onClose }) => {
  return (
    <>
      {/* Background Overlay */}
      <div 
        className="absolute inset-0 bg-black/20 z-[90]"
        onClick={onClose}
      />
      
      {/* Dropdown Box */}
      {/* Located near the bottom right to match the "메뉴" button placement */}
      <div className="absolute bottom-[40px] right-2 w-48 bg-[#2d3748] border-2 border-gray-400 shadow-2xl z-[100] flex flex-col pointer-events-auto">
        
        {/* Header */}
        <div className="bg-[#1a202c] text-white text-[13px] font-bold py-2 px-3 border-b border-gray-600">
          엘비스 Ver. 1.3.2
        </div>

        {/* Menu Items */}
        <div className="flex flex-col text-white text-[14px]">
          <button className="flex items-center space-x-3 px-4 py-2 hover:bg-gray-600 border-b border-gray-700 text-left" onClick={onClose}>
            <span className="w-5 text-center">💸</span>
            <span>당일정산</span>
          </button>
          
          <button className="flex items-center space-x-3 px-4 py-2 hover:bg-gray-600 border-b border-gray-700 text-left" onClick={onClose}>
            <span className="w-5 text-center">🚪</span>
            <span>업무종료</span>
          </button>
          
          <button className="flex items-center space-x-3 px-4 py-2 hover:bg-gray-600 border-b border-gray-700 text-left" onClick={onClose}>
            <span className="w-5 text-center">👥</span>
            <span>고객검색</span>
          </button>
          
          <button className="flex items-center space-x-3 px-4 py-2 hover:bg-gray-600 border-b border-gray-700 text-left" onClick={onClose}>
            <span className="w-5 text-center">⚙️</span>
            <span>환경설정</span>
          </button>
          
          <button className="flex items-center space-x-3 px-4 py-2 hover:bg-gray-600 border-b border-gray-700 text-left" onClick={onClose}>
            <span className="w-5 text-center">🔄</span>
            <span>업데이트안내</span>
          </button>
          
          <button className="flex items-center space-x-3 px-4 py-2 bg-gray-600 border-l-4 border-red-600 border-b border-gray-700 text-left" onClick={onClose}>
            <span className="w-5 text-center">🪪</span>
            <span className="font-bold">기사정보</span>
          </button>
          
          <button className="flex items-center space-x-3 px-4 py-2 hover:bg-gray-600 text-left" onClick={onClose}>
            <span className="w-5 text-center">⚠️</span>
            <span>프로그램종료</span>
          </button>
        </div>

        {/* Footer */}
        <div 
          className="bg-[#1a202c] text-gray-300 flex justify-center items-center py-2 border-t border-gray-600 hover:text-white cursor-pointer"
          onClick={onClose}
        >
          <span className="mr-2">ⓧ</span> 메뉴닫기
        </div>
      </div>
    </>
  );
};
