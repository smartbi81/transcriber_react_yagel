import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";

// Helper function to save cleaned text to S3
async function saveCleanedText(sessionId, text) {
  const s3Client = new S3Client({
    region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY
    }
  });

  try {
    const command = new PutObjectCommand({
      Bucket: "product.transcriber",
      Key: `clean-texts/${sessionId}.txt`,
      Body: text,
      ContentType: 'text/plain; charset=utf-8'
    });

    await s3Client.send(command);
    console.log('Successfully saved cleaned text to S3');
  } catch (error) {
    console.error('Error saving cleaned text:', error);
    throw new Error(`Failed to save cleaned text: ${error.message}`);
  }
}

// Helper function to get AI instructions from S3
async function getAiInstructions() {
  const s3Client = new S3Client({
    region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY
    }
  });

  try {
    const command = new GetObjectCommand({
      Bucket: "product.transcriber",
      Key: "_config/ai-instructions.txt"
    });

    const response = await s3Client.send(command);
    if (!response.Body) throw new Error('No AI instructions found');

    const reader = response.Body.getReader();
    const decoder = new TextDecoder('utf-8');
    let result = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
    
    return result.trim();
    
  } catch (error) {
    console.error('Error reading AI instructions:', error);
    throw new Error(`Failed to read AI instructions: ${error.message}`);
  }
}

// Helper function to get transcription from S3
async function getTranscriptionContent(sessionId) {
  const s3Client = new S3Client({
    region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY
    }
  });

  try {
    console.log('Fetching transcription for session:', sessionId);
    
    const command = new GetObjectCommand({
      Bucket: "product.transcriber",
      Key: `transcriptions/${sessionId}.json`
    });

    const response = await s3Client.send(command);
    if (!response.Body) throw new Error('No transcription found');

    const reader = response.Body.getReader();
    const decoder = new TextDecoder('utf-8');
    let result = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
    
    console.log('Raw transcription data:', result);
    
    const transcriptionData = JSON.parse(result);
    let content = '';

    // Handle uploaded file transcription format
    if (transcriptionData.results?.transcripts) {
      content = transcriptionData.results.transcripts[0]?.transcript || '';
    }
    // Handle real-time transcription format
    else if (transcriptionData.content) {
      content = transcriptionData.content;
    }
    // Handle other potential formats or throw error
    else {
      console.error('Unexpected transcription format:', transcriptionData);
      throw new Error('Invalid transcription format');
    }

    console.log('Extracted content:', content);
    return content;
    
  } catch (error) {
    console.error('Error reading transcription:', error);
    throw new Error(`Failed to read transcription: ${error.message}`);
  }
}

// Update the aiAgentClean function to properly handle the content
export const aiAgentClean = async (sessionId, onProgress) => {
  if (!sessionId) {
    throw new Error('No session ID provided');
  }

  try {
    // Get both AI instructions and transcription content
    const [systemPrompt, transcriptionContent] = await Promise.all([
      getAiInstructions(),
      getTranscriptionContent(sessionId)
    ]);
    
    if (!transcriptionContent) {
      throw new Error('No transcription content found');
    }

    console.log('Initializing Bedrock client...');
    
    // Initialize Bedrock client
    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY
      }
    });

    // Prepare request body for Claude
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 3000,
      temperature: 0,
      system: ".התפקיד שלך לנקות את הטקסט ולשמור עליו כמו שהוא בצורה הגולמית שלו, אל תוסיף הקדמה בהתחה וסיכום סוף. הדבר שצרי לשנות:1. סימני פיסוק לדוגמא נקודותיים יוחלף ל :. 2.מספרים נומרים כשאפשר לדוגמא: חמישים יוחלף ל50",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: transcriptionContent
            }
          ]
        }
      ]
    };

    console.log('Sending request to Bedrock...');

    // Create streaming command for Bedrock
    const command = new InvokeModelWithResponseStreamCommand({
      modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
      body: JSON.stringify(requestBody),
      contentType: "application/json",
      accept: "application/json",
    });

    // Invoke the model with streaming
    const response = await bedrockClient.send(command);
    
    // Handle the streaming response
    let fullResponse = '';
    
    try {
      for await (const chunk of response.body) {
        const decoder = new TextDecoder();
        const chunkText = decoder.decode(chunk.chunk.bytes);
        const parsedChunk = JSON.parse(chunkText);
        
        if (parsedChunk.type === 'content_block_delta') {
          const deltaText = parsedChunk.delta.text;
          fullResponse += deltaText;
          
          // Call the progress callback with the accumulated text
          if (onProgress) {
            onProgress(fullResponse);
          }
        }
      }
      
      console.log('Streaming completed successfully');
      
      // Save the cleaned text to S3
      await saveCleanedText(sessionId, fullResponse);
      
      return fullResponse;
      
    } catch (streamError) {
      console.error('Error processing stream:', streamError);
      throw new Error(`Stream processing error: ${streamError.message}`);
    }
    
  } catch (error) {
    console.error('AI processing error:', error);
    throw new Error(`Failed to process text: ${error.message}`);
  }
};

async function getCleanedText(sessionId) {
  const s3Client = new S3Client({
    region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY
    }
  });

  try {
    console.log('Fetching cleaned text for session:', sessionId);
    
    const command = new GetObjectCommand({
      Bucket: "product.transcriber",
      Key: `clean-texts/${sessionId}.json`  // Changed extension to .json
    });

    const response = await s3Client.send(command);
    if (!response.Body) throw new Error('No cleaned text found');

    const reader = response.Body.getReader();
    const decoder = new TextDecoder('utf-8');
    let jsonString = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      jsonString += decoder.decode(value, { stream: true });
    }
    
    // Parse the JSON string
    const jsonData = JSON.parse(jsonString);
    
    // Return the HTML content from the JSON
    // You can choose to return either html or raw based on your needs
    console.log('Successfully fetched cleaned text');
    return jsonData.html;  // Or jsonData.raw if you prefer the raw text
    
  } catch (error) {
    console.error('Error reading cleaned text:', error);
    throw new Error(`Failed to read cleaned text: ${error.message}`);
  }
}

export const aiAgentSummary = async (sessionId, onProgress) => {
  if (!sessionId) {
    throw new Error('No session ID provided');
  }

  try {
    // Get the cleaned text content
    const cleanedText = await getCleanedText(sessionId);
    
    console.log('Initializing Bedrock client for summary...');
    
    // Initialize Bedrock client
    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY
      }
    });

    // System prompt for summarization
    const systemPrompt = `You are a medical transcription assistant tasked with creating concise, accurate summaries of medical conversations.
Your summaries should:
1. Maintain all relevant medical information
2. Organize information logically
3. Use clear, professional language
4. Preserve any specific numbers, measurements, or dosages
5. Include key patient complaints, symptoms, and diagnoses
6. Highlight any important actions or follow-ups

Format the summary with appropriate headers and bullet points when relevant.
Keep medical terminology intact but provide clear context.`;

    // Prepare request body for Claude
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 3000,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Please provide a clear, structured summary of this medical conversation: \n\n${cleanedText}`
            }
          ]
        }
      ]
    };

    console.log('Sending summary request to Bedrock...');

    // Create streaming command for Bedrock
    const command = new InvokeModelWithResponseStreamCommand({
      modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
      body: JSON.stringify(requestBody),
      contentType: "application/json",
      accept: "application/json",
    });

    // Invoke the model with streaming
    const response = await bedrockClient.send(command);
    
    // Handle the streaming response
    let fullResponse = '';
    
    try {
      for await (const chunk of response.body) {
        const decoder = new TextDecoder();
        const chunkText = decoder.decode(chunk.chunk.bytes);
        const parsedChunk = JSON.parse(chunkText);
        
        if (parsedChunk.type === 'content_block_delta') {
          const deltaText = parsedChunk.delta.text;
          fullResponse += deltaText;
          
          // Call the progress callback with the accumulated text
          if (onProgress) {
            onProgress(fullResponse);
          }
        }
      }
      
      console.log('Summary generation completed successfully');
      
      // Save the summary to S3
      const summaryData = {
        sessionId,
        timestamp: new Date().toISOString(),
        summary: fullResponse,
        originalCleanText: cleanedText
      };

      await saveToS3(
        'product.transcriber',
        `ai-summaries/${sessionId}.json`,
        JSON.stringify(summaryData, null, 2),
        'application/json'
      );
      
      return fullResponse;
      
    } catch (streamError) {
      console.error('Error processing summary stream:', streamError);
      throw new Error(`Stream processing error: ${streamError.message}`);
    }
    
  } catch (error) {
    console.error('AI summary error:', error);
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
};

// Helper function to save to S3
async function saveToS3(bucket, key, data, contentType) {
  const s3Client = new S3Client({
    region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY
    }
  });

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: contentType
    });

    await s3Client.send(command);
    console.log(`Successfully saved to S3: ${key}`);
  } catch (error) {
    console.error('Error saving to S3:', error);
    throw new Error(`Failed to save to S3: ${error.message}`);
  }
}