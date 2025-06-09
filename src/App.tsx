import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Row, Col, Button, Form, Modal, Dropdown, OverlayTrigger, Tooltip } from 'react-bootstrap';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { v4 as uuidv4 } from 'uuid';
import 'bootstrap/dist/css/bootstrap.min.css';

// TypeScript Interfaces
interface ModelInfo {
  id: string;
  name: string;
  description: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  supported_parameters: string[];
  created: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
}

interface Chat {
  id: string;
  name: string;
  messages: Message[];
  activePresetIndex: number;
  created: number;
}

interface Preset {
  name: string;
  modelId: string;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  reasoningEffort: 'low' | 'medium' | 'high' | 'none';
  reasoningMaxTokens: number;
  reasoningExclude: boolean;
}

// Helper function to create default presets
const createDefaultPresets = (defaultModelId: string): Preset[] => {
  return Array.from({ length: 10 }, (_, i) => ({
    name: `Preset ${i + 1}`,
    modelId: defaultModelId,
    systemPrompt: '',
    temperature: 0.0,
    topP: 1.0,
    maxTokens: 0,
    reasoningEffort: 'none',
    reasoningMaxTokens: 0,
    reasoningExclude: false,
  }));
};

// Helper function to check if a chat has a default name
const hasDefaultName = (chat: Chat): boolean => {
  return /^Chat \d+$/.test(chat.name);
};

// Helper function to update default chat names based on first user message
const updateDefaultChatNames = (chats: Chat[]): Chat[] => {
  return chats.map(chat => {
    if (hasDefaultName(chat)) {
      const firstUserMessage = chat.messages.find(msg => msg.role === 'user');
      if (firstUserMessage && firstUserMessage.content.trim()) {
        const newName = firstUserMessage.content.trim().substring(0, 20);
        return { ...chat, name: newName };
      }
    }
    return chat;
  });
};

// Code block component with copy buttons
const CodeBlock: React.FC<{ children: string; className?: string }> = ({ children, className }) => {
  const [copied, setCopied] = useState(false);
  const language = className?.replace('language-', '') || 'text';

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position: 'relative' }}>
      <Button
        size="sm"
        variant="secondary"
        onClick={handleCopy}
        style={{ position: 'absolute', top: '5px', right: '5px', zIndex: 1 }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </Button>
      <SyntaxHighlighter language={language} style={vscDarkPlus}>
        {children}
      </SyntaxHighlighter>
      <Button
        size="sm"
        variant="secondary"
        onClick={handleCopy}
        style={{ position: 'absolute', bottom: '5px', right: '5px' }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </Button>
    </div>
  );
};

// Chat History Panel Component
const ChatHistoryPanel: React.FC<{
  chats: Chat[];
  activeChatId: string | null;
  renamingChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onRenameChat: (chatId: string, newName: string) => void;
  onNewChat: () => void;
  onStartRename: (chatId: string) => void;
}> = ({ chats, activeChatId, renamingChatId, onSelectChat, onRenameChat, onNewChat, onStartRename }) => {
  const [tempName, setTempName] = useState('');

  const handleRenameSubmit = (chatId: string) => {
    if (tempName.trim()) {
      onRenameChat(chatId, tempName.trim());
    }
    onStartRename('');
    setTempName('');
  };

  return (
    <div className="d-flex flex-column h-100 bg-light p-3">
      <h5 className="mb-3">Chat History</h5>
      <div className="flex-grow-1 overflow-auto">
        {chats.slice().reverse().map((chat) => (
          <div
            key={chat.id}
            className={`p-2 mb-2 rounded cursor-pointer ${
              activeChatId === chat.id ? 'bg-primary text-white' : 'bg-white'
            }`}
            onClick={() => onSelectChat(chat.id)}
            style={{ cursor: 'pointer', position: 'relative' }}
          >
            {renamingChatId === chat.id ? (
              <Form.Control
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={() => handleRenameSubmit(chat.id)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameSubmit(chat.id);
                  }
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div className="d-flex justify-content-between align-items-center">
                <span>{chat.name}</span>
                <Button
                  size="sm"
                  variant="link"
                  className={`p-0 ${activeChatId === chat.id ? 'text-white' : 'text-secondary'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTempName(chat.name);
                    onStartRename(chat.id);
                  }}
                >
                  ✏️
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      <Button variant="primary" className="w-100 mt-3" onClick={onNewChat}>
        New Chat
      </Button>
    </div>
  );
};

// Preset Bar Component
const PresetBar: React.FC<{
  presets: Preset[];
  activePresetIndex: number;
  onSelect: (index: number) => void;
}> = ({ presets, activePresetIndex, onSelect }) => {
  return (
    <div className="d-flex gap-2 mb-3 overflow-auto">
      {presets.map((preset, index) => (
        <Button
          key={index}
          variant={index === activePresetIndex ? 'primary' : 'outline-primary'}
          size="sm"
          onClick={() => onSelect(index)}
          style={{ minWidth: '100px' }}
        >
          {preset.name}
        </Button>
      ))}
    </div>
  );
};

// Message Item Component
const MessageItem: React.FC<{
  message: Message;
  onDelete: () => void;
  onCopy: () => void;
  onEdit: (content: string) => void;
}> = ({ message, onDelete, onCopy, onEdit }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  return (
    <div className={`mb-3 d-flex ${message.role === 'user' ? 'justify-content-end' : 'justify-content-start'}`}>
      <div
        className={`p-3 rounded ${
          message.role === 'user' ? 'text-white' : 'bg-light'
        }`}
        onMouseEnter={() => setShowMenu(true)}
        onMouseLeave={() => setShowMenu(false)}
        style={{
          position: 'relative',
          maxWidth: '90%',
          backgroundColor: message.role === 'user' ? '#6f9bff' : undefined
        }}
      >
      <div className="d-flex justify-content-between align-items-start">
        <div className="flex-grow-1">
          <strong>{message.role === 'user' ? 'User' : 'Assistant'}:</strong>
          {message.reasoning && !message.content && (
            <div className="mt-2 p-2 bg-secondary text-white rounded">
              <strong>Reasoning:</strong>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code(props: any) {
                    const { node, inline, className, children, ...rest } = props;
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <CodeBlock className={className}>
                        {String(children).replace(/\n$/, '')}
                      </CodeBlock>
                    ) : (
                      <code className={className} {...rest}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.reasoning}
              </ReactMarkdown>
            </div>
          )}
          <div className="mt-2" onDoubleClick={() => setIsEditing(true)}>
            {isEditing ? (
              <div>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                      onEdit(editContent);
                      setIsEditing(false);
                    } else if (e.key === 'Escape') {
                      setEditContent(message.content);
                      setIsEditing(false);
                    }
                  }}
                  onBlur={() => {
                    onEdit(editContent);
                    setIsEditing(false);
                  }}
                  autoFocus
                />
                <small className="text-muted">Press Ctrl+Enter to save, Escape to cancel</small>
              </div>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code(props: any) {
                    const { node, inline, className, children, ...rest } = props;
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <CodeBlock className={className}>
                        {String(children).replace(/\n$/, '')}
                      </CodeBlock>
                    ) : (
                      <code className={className} {...rest}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        </div>
        {showMenu && (
          <div className="ms-2">
            <Button size="sm" variant="secondary" className="me-1" onClick={onCopy}>
              Copy
            </Button>
            <Button size="sm" variant="danger" onClick={onDelete}>
              Delete
            </Button>
            </div>
        )}
      </div>
      </div>
    </div>
  );
};

// Settings Modal Component
const SettingsModal: React.FC<{
  show: boolean;
  onHide: () => void;
  presets: Preset[];
  setPresets: React.Dispatch<React.SetStateAction<Preset[]>>;
  activePresetIndex: number;
  models: ModelInfo[];
  apiKey: string;
  setApiKey: React.Dispatch<React.SetStateAction<string>>;
  onPresetIndexChange: (index: number) => void;
}> = ({ show, onHide, presets, setPresets, activePresetIndex, models, apiKey, setApiKey, onPresetIndexChange }) => {
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(activePresetIndex);
  const selectedPreset = presets[selectedPresetIndex];
  const selectedModel = models.find((m) => m.id === selectedPreset?.modelId);

  const updatePreset = (field: keyof Preset, value: any) => {
    const newPresets = [...presets];
    newPresets[selectedPresetIndex] = { ...newPresets[selectedPresetIndex], [field]: value };
    setPresets(newPresets);
  };

  const inputCost = selectedModel ? (parseFloat(selectedModel.pricing.prompt) * 1000000).toFixed(2) : '0.00';
  const outputCost = selectedModel ? (parseFloat(selectedModel.pricing.completion) * 1000000).toFixed(2) : '0.00';

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Settings</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group className="mb-3">
            <Form.Label>API Key</Form.Label>
            <Form.Control
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your OpenRouter API key"
            />
          </Form.Group>

          <div className="d-flex gap-2 mb-3 overflow-auto">
            {presets.map((preset, index) => (
              <Button
                key={index}
                variant={index === selectedPresetIndex ? 'primary' : 'outline-primary'}
                size="sm"
                onClick={() => {
                  setSelectedPresetIndex(index);
                  onPresetIndexChange(index);
                }}
              >
                {preset.name}
              </Button>
            ))}
          </div>

          {selectedPreset && (
            <>
              <Form.Group className="mb-3">
                <Form.Label>Preset Name</Form.Label>
                <Form.Control
                  type="text"
                  value={selectedPreset.name}
                  onChange={(e) => updatePreset('name', e.target.value)}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Model</Form.Label>
                <Form.Select
                  value={selectedPreset.modelId}
                  onChange={(e) => updatePreset('modelId', e.target.value)}
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>System Prompt</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={selectedPreset.systemPrompt}
                  onChange={(e) => updatePreset('systemPrompt', e.target.value)}
                />
              </Form.Group>

              <Row>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Temperature</Form.Label>
                    <Form.Control
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={selectedPreset.temperature}
                      onChange={(e) => updatePreset('temperature', parseFloat(e.target.value))}
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Top P</Form.Label>
                    <Form.Control
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={selectedPreset.topP}
                      onChange={(e) => updatePreset('topP', parseFloat(e.target.value))}
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Max Tokens</Form.Label>
                    <Form.Control
                      type="number"
                      min="1"
                      max="32000"
                      value={selectedPreset.maxTokens}
                      onChange={(e) => updatePreset('maxTokens', parseInt(e.target.value))}
                    />
                  </Form.Group>
                </Col>
              </Row>

              <h6>Reasoning Settings</h6>
              <Row>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Reasoning Effort</Form.Label>
                    <Form.Select
                      value={selectedPreset.reasoningEffort}
                      onChange={(e) => updatePreset('reasoningEffort', e.target.value)}
                    >
                      <option value="none">None</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Reasoning Max Tokens</Form.Label>
                    <Form.Control
                      type="number"
                      min="0"
                      max="32000"
                      value={selectedPreset.reasoningMaxTokens}
                      onChange={(e) => updatePreset('reasoningMaxTokens', parseInt(e.target.value))}
                      disabled={selectedPreset.reasoningEffort !== 'none'}
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Exclude Reasoning</Form.Label>
                    <Form.Check
                      type="checkbox"
                      checked={selectedPreset.reasoningExclude}
                      onChange={(e) => updatePreset('reasoningExclude', e.target.checked)}
                      label="Exclude from response"
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Input Cost (per MTok)</Form.Label>
                    <Form.Control type="text" value={`$${inputCost}`} readOnly />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Output Cost (per MTok)</Form.Label>
                    <Form.Control type="text" value={`$${outputCost}`} readOnly />
                  </Form.Group>
                </Col>
              </Row>
            </>
          )}
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

// Chat Area Component
const ChatArea: React.FC<{
  chat: Chat | null;
  presets: Preset[];
  onUpdateMessage: (messageId: string, content: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onSendMessage: (content: string) => void;
  onPresetSelect: (index: number) => void;
  onOpenSettings: () => void;
  isLoading: boolean;
}> = ({ chat, presets, onUpdateMessage, onDeleteMessage, onSendMessage, onPresetSelect, onOpenSettings, isLoading }) => {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chat?.messages]);

  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      const maxHeight = window.innerHeight * 0.9;
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, [inputValue]);

  const handleSend = () => {
    const canSendEmpty = chat?.messages.length && chat.messages[chat.messages.length - 1].role === 'user';
    if ((inputValue.trim() || canSendEmpty) && !isLoading) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleCopyMessage = (message: Message) => {
    const textToCopy = message.reasoning && message.content
      ? `Reasoning:\n${message.reasoning}\n\nResponse:\n${message.content}`
      : message.reasoning || message.content;
    navigator.clipboard.writeText(textToCopy);
  };

  if (!chat) {
    return (
      <div className="d-flex flex-column h-100 p-4">
        <div className="flex-grow-1 d-flex align-items-center justify-content-center">
          <h3 className="text-muted">Select or create a chat to begin</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column h-100 p-4">
      <PresetBar
        presets={presets}
        activePresetIndex={chat.activePresetIndex}
        onSelect={onPresetSelect}
      />

      <div className="flex-grow-1 overflow-auto mb-3">
        {chat.messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            onDelete={() => onDeleteMessage(message.id)}
            onCopy={() => handleCopyMessage(message)}
            onEdit={(content) => onUpdateMessage(message.id, content)}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="d-flex gap-2">
        <Form.Control
          as="textarea"
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type your message..."
          disabled={isLoading}
          style={{
            minHeight: '38px',
            maxHeight: `${window.innerHeight * 0.9}px`,
            resize: 'none',
            overflow: 'auto'
          }}
        />
        <div className="d-flex flex-column gap-2">
          <Button
            variant="primary"
            onClick={handleSend}
            disabled={isLoading || (!inputValue.trim() && (!chat?.messages.length || chat.messages[chat.messages.length - 1].role !== 'user'))}
          >
            {isLoading ? 'Sending...' : 'Send'}
          </Button>
          <Button variant="secondary" onClick={onOpenSettings}>
            Settings
          </Button>
        </div>
      </div>
    </div>
  );
};

// Main App Component
function App() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [apiKey, setApiKey] = useState<string>('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem('apiKey');
    const savedChats = localStorage.getItem('chats');
    const savedPresets = localStorage.getItem('presets');

    if (savedApiKey) setApiKey(savedApiKey);
    if (savedChats) {
      const parsedChats = JSON.parse(savedChats);
      setChats(parsedChats);

      // Select the newest chat (highest created timestamp)
      if (parsedChats.length > 0) {
        const newestChat = parsedChats.reduce((newest: Chat, current: Chat) =>
          current.created > newest.created ? current : newest
        );
        setActiveChatId(newestChat.id);
      }
    }
    if (savedPresets) setPresets(JSON.parse(savedPresets));
  }, []);

  // Save data to localStorage when it changes
  useEffect(() => {
    if (apiKey) localStorage.setItem('apiKey', apiKey);
  }, [apiKey]);

  useEffect(() => {
    if (chats.length > 0) localStorage.setItem('chats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    if (presets.length > 0) localStorage.setItem('presets', JSON.stringify(presets));
  }, [presets]);

  // Update default chat names on app launch
  useEffect(() => {
    if (chats.length > 0) {
      const updatedChats = updateDefaultChatNames(chats);
      const hasChanges = updatedChats.some((chat, index) => chat.name !== chats[index].name);
      if (hasChanges) {
        setChats(updatedChats);
      }
    }
  }, []); // Run once on mount after chats are loaded

  // Fetch models on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/models');
        const data = await response.json();
        const sortedModels = data.data.sort((a: ModelInfo, b: ModelInfo) => b.created - a.created);
        setModels(sortedModels);

        // Initialize presets only if none exist and none were saved in localStorage
        const savedPresets = localStorage.getItem('presets');
        if (presets.length === 0 && !savedPresets && sortedModels.length > 0) {
          setPresets(createDefaultPresets(sortedModels[0].id));
        }
      } catch (error) {
        console.error('Failed to fetch models:', error);
      }
    };

    fetchModels();
  }, [presets.length]);

  const activeChat = chats.find((chat) => chat.id === activeChatId) || null;

  const handleCreateNewChat = () => {
    const newChat: Chat = {
      id: uuidv4(),
      name: `Chat ${chats.length + 1}`,
      messages: [],
      activePresetIndex: 0,
      created: Date.now(),
    };
    setChats([...chats, newChat]);
    setActiveChatId(newChat.id);
  };

  const handleRenameChat = (chatId: string, newName: string) => {
    setChats(chats.map((chat) => (chat.id === chatId ? { ...chat, name: newName } : chat)));
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!activeChat) return;
    const updatedMessages = activeChat.messages.filter((msg) => msg.id !== messageId);
    setChats(chats.map((chat) =>
      chat.id === activeChat.id ? { ...chat, messages: updatedMessages } : chat
    ));
  };

  const handleUpdateMessage = (messageId: string, content: string) => {
    if (!activeChat) return;
    const updatedMessages = activeChat.messages.map((msg) =>
      msg.id === messageId ? { ...msg, content } : msg
    );
    setChats(chats.map((chat) =>
      chat.id === activeChat.id ? { ...chat, messages: updatedMessages } : chat
    ));
  };

  const handlePresetSelect = (index: number) => {
    if (!activeChat) return;
    setChats(chats.map((chat) =>
      chat.id === activeChat.id ? { ...chat, activePresetIndex: index } : chat
    ));
  };

  const handleSendMessage = async (content: string) => {
    if (!activeChat || !apiKey) {
      alert('Please set your API key in settings');
      return;
    }

    const preset = presets[activeChat.activePresetIndex];
    const assistantMessage: Message = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      reasoning: '',
    };

    // Only add user message if content is not empty
    let updatedMessages:any;
    if (content) {
      const userMessage: Message = {
        id: uuidv4(),
        role: 'user',
        content,
      };
      updatedMessages = [...activeChat.messages, userMessage, assistantMessage];
    } else {
      updatedMessages = [...activeChat.messages, assistantMessage];
    }

    // Update chat name if it has a default name and this is a user message
    let updatedChatName = activeChat.name;
    if (content && hasDefaultName(activeChat)) {
      updatedChatName = content.trim().substring(0, 20);
    }

    setChats(chats.map((chat) =>
      chat.id === activeChat.id ? { ...chat, messages: updatedMessages, name: updatedChatName } : chat
    ));

    setIsLoading(true);

    try {
      // Prepare messages for API
      const messagesForApi = updatedMessages.slice(0, -1); // Remove the assistant message we just added
      const apiMessages = preset.systemPrompt
        ? [{ role: 'system', content: preset.systemPrompt }, ...messagesForApi]
        : messagesForApi;

      // Prepare reasoning config
      const reasoningConfig: any = {};
      if (preset.reasoningEffort !== 'none') {
        reasoningConfig.effort = preset.reasoningEffort;
      } else if (preset.reasoningMaxTokens > 0) {
        reasoningConfig.max_tokens = preset.reasoningMaxTokens;
      }
      if (preset.reasoningExclude) {
        reasoningConfig.exclude = true;
      }

      const requestBody: any = {
        model: preset.modelId,
        messages: apiMessages,
        stream: true,
        temperature: preset.temperature,
        top_p: preset.topP,
        max_tokens: preset.maxTokens,
      };

      if (Object.keys(reasoningConfig).length > 0) {
        requestBody.reasoning = reasoningConfig;
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No response body');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;

              if (delta?.content) {
                setChats((prevChats) =>
                  prevChats.map((chat) =>
                    chat.id === activeChat.id
                      ? {
                          ...chat,
                          messages: chat.messages.map((msg) =>
                            msg.id === assistantMessage.id
                              ? { ...msg, content: msg.content + delta.content }
                              : msg
                          ),
                        }
                      : chat
                  )
                );
              }

              if (delta?.reasoning) {
                setChats((prevChats) =>
                  prevChats.map((chat) =>
                    chat.id === activeChat.id
                      ? {
                          ...chat,
                          messages: chat.messages.map((msg) =>
                            msg.id === assistantMessage.id
                              ? { ...msg, reasoning: (msg.reasoning || '') + delta.reasoning }
                              : msg
                          ),
                        }
                      : chat
                  )
                );
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please check your API key and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container fluid className="vh-100 p-0">
      <Row className="h-100 g-0">
        <Col xs={2} className="h-100 border-end">
          <ChatHistoryPanel
            chats={chats}
            activeChatId={activeChatId}
            renamingChatId={renamingChatId}
            onSelectChat={setActiveChatId}
            onRenameChat={handleRenameChat}
            onNewChat={handleCreateNewChat}
            onStartRename={setRenamingChatId}
          />
        </Col>
        <Col xs={10} className="h-100">
          <ChatArea
            chat={activeChat}
            presets={presets}
            onUpdateMessage={handleUpdateMessage}
            onDeleteMessage={handleDeleteMessage}
            onSendMessage={handleSendMessage}
            onPresetSelect={handlePresetSelect}
            onOpenSettings={() => setShowSettingsModal(true)}
            isLoading={isLoading}
          />
        </Col>
      </Row>

      <SettingsModal
        show={showSettingsModal}
        onHide={() => setShowSettingsModal(false)}
        presets={presets}
        setPresets={setPresets}
        activePresetIndex={activeChat?.activePresetIndex || 0}
        models={models}
        apiKey={apiKey}
        setApiKey={setApiKey}
        onPresetIndexChange={handlePresetSelect}
      />
    </Container>
  );
}

export default App;