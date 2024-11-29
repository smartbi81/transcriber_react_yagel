import React, { useState, useRef, useEffect } from 'react';

const TextDisplay = ({ text }) => {
  const [showCopy, setShowCopy] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef(null);

  // Auto-scroll effect
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [text]);

  const handleCopy = async () => {
    try {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = text;
      const textToCopy = tempDiv.textContent || tempDiv.innerText;

      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  return (
    <div className="relative">
      {/* Header area with copy button */}
      <div
        className="absolute top-0 left-0 right-0 h-8 flex justify-end items-center px-2 z-10"
        onMouseEnter={() => setShowCopy(true)}
        onMouseLeave={() => setShowCopy(false)}
      >
        {showCopy && (
          <button
            onClick={handleCopy}
            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-md text-sm transition-all duration-200 flex items-center gap-1"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                הועתק!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                העתק
              </>
            )}
          </button>
        )}
      </div>

      {/* Resizable text content */}
      <div
        className="group relative h-64 w-full overflow-hidden"
        style={{ resize: 'vertical' }}
      >
        <div
          ref={contentRef}
          dangerouslySetInnerHTML={{ __html: text }}
          className="absolute inset-0 p-4 border-2 border-blue-300 rounded-lg text-right focus:outline-none focus:border-blue-500 overflow-auto bg-white"
          dir="rtl"
          style={{
            whiteSpace: 'pre-wrap',
          }}
        />

        {/* Left-side resize handle indicator */}
        <div className="absolute bottom-0 right-2 w-4 h-4 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity duration-200">

        </div>
      </div>
    </div>
  );
};

export default TextDisplay;