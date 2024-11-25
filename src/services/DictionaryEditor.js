import React, { useState, useEffect, useMemo } from 'react';
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const loadDictionary = async () => {
  setIsLoading(true);
  setError('');

  try {
    const s3Client = new S3Client({
      region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY
      }
    });

    const command = new GetObjectCommand({
      Bucket: "product.transcriber",
      Key: "_config/dictionary.csv"
    });

    const response = await s3Client.send(command);
    
    // Read the file content using UTF-8
    const reader = response.Body.getReader();
    const decoder = new TextDecoder('utf-8');
    let content = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      content += decoder.decode(value, { stream: true });
    }

    // Split into lines and parse CSV
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    const [header, ...dataRows] = lines;
    
    // Parse CSV with proper handling of quotes and commas
    const parsedEntries = dataRows.map(row => {
      const fields = parseCSVLine(row);
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
    console.error('Error loading dictionary:', error);
    setError('שגיאה בטעינת המילון');
  } finally {
    setIsLoading(false);
  }
};

const saveDictionary = async () => {
  setIsSaving(true);
  setError('');

  try {
    // Create CSV content with proper escaping
    const header = 'Phrase,SoundsLike,IPA,DisplayAs';
    const csvLines = [
      header,
      ...entries.map(entry => {
        const fields = [
          entry.phrase,
          entry.soundsLike,
          entry.ipa,
          entry.displayAs
        ].map(field => {
          // Escape fields that contain commas or quotes
          if (field.includes(',') || field.includes('"')) {
            return `"${field.replace(/"/g, '""')}"`;
          }
          return field;
        });
        return fields.join(',');
      })
    ];

    const csvContent = csvLines.join('\n');
    
    // Use UTF-8 encoding
    const encoder = new TextEncoder();
    const encodedContent = encoder.encode(csvContent);

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