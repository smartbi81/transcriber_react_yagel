import React, { useState, useEffect, useMemo } from 'react';
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const debugBuffer = (buffer) => {
    console.log('Buffer content (first 100 bytes):', 
      Array.from(buffer.slice(0, 100))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')
    );
  };

const LoadingSpinner = () => (
  <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const SortIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 15l5 5 5-5"/>
    <path d="M7 9l5-5 5 5"/>
  </svg>
);

function parseCSVLine(line) {
    // This regex matches either a quoted field or an unquoted field
    const regex = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^,]*))/g;
    const fields = [];
    let match;
    
    while ((match = regex.exec(line))) {
      // If the first capturing group exists, use it (quoted field)
      // Otherwise use the second group (unquoted field)
      fields.push((match[1] || match[2] || '').trim());
    }
    
    return fields;
  }


const DictionaryEditor = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [newEntry, setNewEntry] = useState({
    phrase: '',
    soundsLike: '',
    ipa: '',
    displayAs: ''
  });

  const parseCSVLine = (line) => {
    const regex = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^,]*))/g;
    const fields = [];
    let match;
    
    while ((match = regex.exec(line))) {
      const field = match[1] || match[2] || '';
      fields.push(decodeURIComponent(field.trim()));
    }
    
    return fields;
  };


  
  const loadDictionary = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const command = new GetObjectCommand({
        Bucket: "product.transcriber",
        Key: "_config/dictionary.csv"
      });
  
      const response = await s3Client.send(command);
      const content = await response.Body.transformToByteArray();
      
      const decoder = new TextDecoder('utf-8');
      const text = '\uFEFF' + decoder.decode(content);
      
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const parsedEntries = lines.slice(1).map(line => {
        const fields = parseCSVLine(line);
        return {
          phrase: fields[0] || '',
          soundsLike: fields[1] || '',
          ipa: fields[2] || '',
          displayAs: fields[3] || ''
        };
      });
  
      setEntries(parsedEntries);
      setIsEditing(true);
    } catch (error) {
      console.error('Error:', error);
      setError('שגיאה בטעינת המילון');
    }
    setIsLoading(false);
  };
  
  const saveDictionary = async () => {
    setIsSaving(true);
    setError('');
    
    try {
      const BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const header = 'Phrase,SoundsLike,IPA,DisplayAs\n';
      
      const csvLines = entries.map(entry => {
        const fields = [
          encodeURIComponent(entry.phrase),
          encodeURIComponent(entry.soundsLike),
          encodeURIComponent(entry.ipa),
          encodeURIComponent(entry.displayAs)
        ].map(field => field.includes(',') ? `"${field}"` : field);
        return fields.join(',');
      });
  
      const csvContent = header + csvLines.join('\n');
      const encoder = new TextEncoder();
      const encodedContent = new Uint8Array([...BOM, ...encoder.encode(csvContent)]);
  
      const s3Client = new S3Client({
        region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY
        }
      });
  
      const command = new PutObjectCommand({
        Bucket: "product.transcriber",
        Key: "_config/dictionary.csv",
        Body: encodedContent,
        ContentType: 'text/csv; charset=utf-8'
      });
  
      await s3Client.send(command);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving dictionary:', error);
      setError('שגיאה בשמירת המילון');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredAndSortedEntries = useMemo(() => {
    let result = [...entries];
    
    if (searchTerm) {
      const lowercasedSearch = searchTerm.toLowerCase();
      result = result.filter(entry =>
        Object.values(entry).some(value => 
          value.toLowerCase().includes(lowercasedSearch)
        )
      );
    }
    
    if (sortConfig.key) {
      result.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    
    return result;
  }, [entries, searchTerm, sortConfig]);

  const addNewEntry = () => {
    if (newEntry.phrase && newEntry.displayAs) {
      setEntries([...entries, newEntry]);
      setNewEntry({
        phrase: '',
        soundsLike: '',
        ipa: '',
        displayAs: ''
      });
    }
  };

  const deleteEntry = (index) => {
    const newEntries = [...entries];
    newEntries.splice(index, 1);
    setEntries(newEntries);
  };

  return (
    <div className="relative">
      {!isEditing ? (
        <button
          onClick={loadDictionary}
          disabled={isLoading}
          className="btn-secondary w-full"
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <LoadingSpinner />
              טוען...
            </span>
          ) : (
            'עריכת מילון 📝'
          )}
        </button>
      ) : (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-6xl h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">עריכת מילון</h3>
              <button 
                onClick={() => setIsEditing(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <CloseIcon />
              </button>
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4 text-right">
                {error}
              </div>
            )}

            <div className="flex gap-4 mb-4">
              <div className="flex-1 relative">
                <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="חיפוש..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-4 py-2 border rounded-md text-right"
                  dir="rtl"
                />
              </div>
              <button
                onClick={saveDictionary}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? 'שומר...' : 'שמירה'}
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="תיקון"
                value={newEntry.phrase}
                onChange={(e) => setNewEntry({ ...newEntry, phrase: e.target.value })}
                className="flex-1 px-4 py-2 border rounded-md text-right"
                dir="rtl"
              />
              <input
                type="text"
                placeholder="נשמע כמו"
                value={newEntry.soundsLike}
                onChange={(e) => setNewEntry({ ...newEntry, soundsLike: e.target.value })}
                className="flex-1 px-4 py-2 border rounded-md text-right"
                dir="rtl"
              />
              <input
                type="text"
                placeholder="IPA"
                value={newEntry.ipa}
                onChange={(e) => setNewEntry({ ...newEntry, ipa: e.target.value })}
                className="flex-1 px-4 py-2 border rounded-md"
              />
              <input
                type="text"
                placeholder="להציג בתור"
                value={newEntry.displayAs}
                onChange={(e) => setNewEntry({ ...newEntry, displayAs: e.target.value })}
                className="flex-1 px-4 py-2 border rounded-md text-right"
                dir="rtl"
              />
              <button
                onClick={addNewEntry}
                className="p-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                <PlusIcon />
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-right p-4 border">
                      <button
                        className="flex items-center justify-end w-full"
                        onClick={() => handleSort('phrase')}
                      >
                        תיקון
                        <SortIcon className="mr-2" />
                      </button>
                    </th>
                    <th className="text-right p-4 border">
                      <button
                        className="flex items-center justify-end w-full"
                        onClick={() => handleSort('soundsLike')}
                      >
                        נשמע כמו
                        <SortIcon className="mr-2" />
                      </button>
                    </th>
                    <th className="text-right p-4 border">
                      <button
                        className="flex items-center justify-end w-full"
                        onClick={() => handleSort('ipa')}
                      >
                        IPA
                        <SortIcon className="mr-2" />
                      </button>
                    </th>
                    <th className="text-right p-4 border">
                      <button
                        className="flex items-center justify-end w-full"
                        onClick={() => handleSort('displayAs')}
                      >
                        להציג בתור
                        <SortIcon className="mr-2" />
                      </button>
                    </th>
                    <th className="w-[60px] p-4 border"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedEntries.map((entry, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="text-right p-4 border" dir="rtl">{entry.phrase}</td>
                      <td className="text-right p-4 border" dir="rtl">{entry.soundsLike}</td>
                      <td className="text-left p-4 border">{entry.ipa}</td>
                      <td className="text-right p-4 border" dir="rtl">{entry.displayAs}</td>
                      <td className="p-4 border">
                        <button
                          onClick={() => deleteEntry(index)}
                          className="p-1 text-red-500 hover:text-red-700 rounded"
                        >
                          <CloseIcon />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DictionaryEditor;