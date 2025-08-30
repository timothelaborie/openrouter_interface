import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  Container,
  Row,
  Col,
  Button,
  Form,
  Modal,
  Dropdown,
  OverlayTrigger,
  Tooltip,
} from "react-bootstrap"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism"
import { v4 as uuidv4 } from "uuid"
import "bootstrap/dist/css/bootstrap.min.css"

// TypeScript Interfaces
interface ModelInfo {
  id: string
  name: string
  description: string
  context_length: number
  pricing: {
    prompt: string
    completion: string
  }
  supported_parameters: string[]
  created: number
}

interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string | Array<{type: 'text', text: string} | {type: 'image_url', image_url: {url: string}}>
  reasoning?: string
  messageType?: "reasoning" | "regular"
}

interface Chat {
  id: string
  name: string
  messages: Message[]
  activePresetIndex: number
  created: number
}

interface Preset {
  name: string
  modelId: string
  systemPrompt: string
  temperature: number
  topP: number
  maxTokens: number
  reasoningEffort: "low" | "medium" | "high" | "none"
  reasoningMaxTokens: number
  reasoningExclude: boolean
}

// Helper function to create default presets
const createDefaultPresets = (defaultModelId: string): Preset[] => {
  return Array.from({ length: 10 }, (_, i) => ({
    name: `Preset ${i + 1}`,
    modelId: defaultModelId,
    systemPrompt: "",
    temperature: 0.0,
    topP: 1.0,
    maxTokens: 0,
    reasoningEffort: "none",
    reasoningMaxTokens: 0,
    reasoningExclude: false,
  }))
}

// Helper function to check if a chat has a default name
const hasDefaultName = (chat: Chat): boolean => {
  return /^Chat \d+$/.test(chat.name)
}

// Helper function to update default chat names based on first user message
const updateDefaultChatNames = (chats: Chat[]): Chat[] => {
  return chats.map((chat) => {
    if (hasDefaultName(chat)) {
      const firstUserMessage = chat.messages.find((msg) => msg.role === "user")
      if (firstUserMessage && typeof firstUserMessage.content === "string" && firstUserMessage.content.trim()) {
        const newName = firstUserMessage.content.trim().substring(0, 20)
        return { ...chat, name: newName }
      }
    }
    return chat
  })
}

// Helper function to convert image file to base64
const imageToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Code block component with copy buttons
const CodeBlock: React.FC<{ children: string; className?: string }> = ({
  children,
  className,
}) => {
  const [copied, setCopied] = useState(false)
  const language = className?.replace("language-", "") || "text"

  const handleCopy = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ position: "relative" }}>
      <Button
        size="sm"
        variant="secondary"
        onClick={handleCopy}
        style={{ position: "absolute", top: "5px", right: "5px", zIndex: 1 }}
      >
        {copied ? "Copied!" : "Copy"}
      </Button>
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        lineProps={{
          style: { wordBreak: "break-all", whiteSpace: "pre-wrap" },
        }}
        wrapLines={true}
      >
        {children}
      </SyntaxHighlighter>
      <Button
        size="sm"
        variant="secondary"
        onClick={handleCopy}
        style={{ position: "absolute", bottom: "5px", right: "5px" }}
      >
        {copied ? "Copied!" : "Copy"}
      </Button>
    </div>
  )
}

// Chat History Panel Component
const ChatHistoryPanel: React.FC<{
  chats: Chat[]
  activeChatId: string | null
  renamingChatId: string | null
  onSelectChat: (chatId: string) => void
  onRenameChat: (chatId: string, newName: string) => void
  onDeleteChat: (chatId: string) => void
  onNewChat: () => void
  onStartRename: (chatId: string) => void
}> = ({
  chats,
  activeChatId,
  renamingChatId,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onNewChat,
  onStartRename,
}) => {
  const [tempName, setTempName] = useState("")

  const handleRenameSubmit = (chatId: string) => {
    if (tempName.trim()) {
      onRenameChat(chatId, tempName.trim())
    }
    onStartRename("")
    setTempName("")
  }

  return (
    <div className="d-flex flex-column h-100 bg-light p-3">
      <h5 className="mb-3">Chat History</h5>
      <div className="flex-grow-1 overflow-auto">
        {chats
          .slice()
          .reverse()
          .map((chat) => (
            <div
              key={chat.id}
              className={`p-2 mb-2 rounded cursor-pointer ${
                activeChatId === chat.id ? "bg-primary text-white" : "bg-white"
              }`}
              onClick={() => onSelectChat(chat.id)}
              style={{ cursor: "pointer", position: "relative" }}
            >
              {renamingChatId === chat.id ? (
                <Form.Control
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onBlur={() => handleRenameSubmit(chat.id)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      handleRenameSubmit(chat.id)
                    }
                  }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="d-flex justify-content-between align-items-center">
                  <span>{chat.name}</span>
                  <div className="d-flex gap-1">
                    {activeChatId === chat.id && (
                      <Button
                        size="sm"
                        variant="link"
                        className="p-0 text-danger"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteChat(chat.id)
                        }}
                      >
                        🗑️
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="link"
                      className={`p-0 ${
                        activeChatId === chat.id
                          ? "text-white"
                          : "text-secondary"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setTempName(chat.name)
                        onStartRename(chat.id)
                      }}
                    >
                      ✏️
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>
      <Button variant="primary" className="w-100 mt-3" onClick={onNewChat}>
        New Chat
      </Button>
    </div>
  )
}

// Preset Bar Component
const PresetBar: React.FC<{
  presets: Preset[]
  activePresetIndex: number
  onSelect: (index: number) => void
}> = ({ presets, activePresetIndex, onSelect }) => {
  return (
    <div className="d-flex gap-2 mb-3 overflow-auto">
      {presets.map((preset, index) => (
        <Button
          key={index}
          variant={index === activePresetIndex ? "primary" : "outline-primary"}
          size="sm"
          onClick={() => onSelect(index)}
          style={{ minWidth: "100px" }}
        >
          {preset.name}
        </Button>
      ))}
    </div>
  )
}

// Message Item Component
const MessageItem: React.FC<{
  message: Message
  onDeleteMessage: (messageId: string) => void
  onCopyMessage: (message: Message) => void
  onUpdateMessage: (messageId: string, content: string) => void
  isStreaming: boolean
}> = React.memo(({ message, onDeleteMessage, onCopyMessage, onUpdateMessage, isStreaming }) => {
  const isReasoningMessage = message.messageType === "reasoning"
  const hasImageContent = Array.isArray(message.content) && message.content.some(item => item.type === "image_url")

  // Determine the correct content to edit
  const getEditableContent = () => {
    if (isReasoningMessage) {
      return message.reasoning || ""
    }
    if (typeof message.content === "string") {
      return message.content
    }
    // For array content, get text parts only
    if (Array.isArray(message.content)) {
      return message.content
        .filter(item => item.type === "text")
        .map(item => (item as any).text)
        .join("\n")
    }
    return ""
  }

  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(getEditableContent())

  // Update editContent when message content changes (e.g., during streaming)
  useEffect(() => {
    if (!isEditing) {
      setEditContent(getEditableContent())
    }
  }, [message.content, message.reasoning, isEditing])

  const handleDelete = useCallback(() => {
    onDeleteMessage(message.id)
  }, [onDeleteMessage, message.id])

  const handleCopy = useCallback(() => {
    onCopyMessage(message)
  }, [onCopyMessage, message])

  const handleEdit = useCallback((content: string) => {
    onUpdateMessage(message.id, content)
  }, [onUpdateMessage, message.id])

  return (
    <div
      className={`mb-3 d-flex ${
        message.role === "user"
          ? "justify-content-end"
          : "justify-content-start"
      }`}
    >
      <div
        className={`p-3 rounded ${
          message.role === "user"
            ? "text-white"
            : isReasoningMessage
            ? "bg-secondary text-white"
            : "bg-light"
        }`}
        style={{
          position: "relative",
          maxWidth: "90%",
          backgroundColor: message.role === "user" ? "#6f9bff" : undefined,
        }}
      >
        <div className="d-flex justify-content-between align-items-start">
          <div className="flex-grow-1">
            <strong>
              {message.role === "user"
                ? "User"
                : isReasoningMessage
                ? "Reasoning"
                : "Assistant"}
              :
            </strong>
            <div className="mt-2" onDoubleClick={() => {
              if (!(isStreaming && message.role === "assistant") && !hasImageContent) {
                setIsEditing(true)
              }
            }}>
              {isEditing ? (
                <div>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.ctrlKey) {
                        handleEdit(editContent)
                        setIsEditing(false)
                      } else if (e.key === "Escape") {
                        setEditContent(typeof message.content === "string" ? message.content : "")
                        setIsEditing(false)
                      }
                    }}
                    onBlur={() => {
                      handleEdit(editContent)
                      setIsEditing(false)
                    }}
                    autoFocus
                  />
                  <small className="text-muted">
                    Press Ctrl+Enter to save, Escape to cancel
                  </small>
                </div>
              ) : (
                <div>
                  {Array.isArray(message.content) ? (
                    message.content.map((item, index) => (
                      <div key={index} className="mb-2">
                        {item.type === "text" ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code(props: any) {
                                const { node, inline, className, children, ...rest } = props
                                const match = /language-(\w+)/.exec(className || "")
                                return !inline && match ? (
                                  <CodeBlock className={className}>
                                    {String(children).replace(/\n$/, "")}
                                  </CodeBlock>
                                ) : (
                                  <code className={className} {...rest}>
                                    {children}
                                  </code>
                                )
                              },
                            }}
                          >
                            {item.text}
                          </ReactMarkdown>
                        ) : item.type === "image_url" ? (
                          <img
                            src={item.image_url.url}
                            alt="Pasted image"
                            style={{ maxWidth: "100%", height: "auto", borderRadius: "8px" }}
                          />
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code(props: any) {
                          const { node, inline, className, children, ...rest } = props
                          const match = /language-(\w+)/.exec(className || "")
                          return !inline && match ? (
                            <CodeBlock className={className}>
                              {String(children).replace(/\n$/, "")}
                            </CodeBlock>
                          ) : (
                            <code className={className} {...rest}>
                              {children}
                            </code>
                          )
                        },
                      }}
                    >
                      {isReasoningMessage
                        ? message.reasoning || ""
                        : message.content as string}
                    </ReactMarkdown>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="ms-2 d-flex flex-column gap-1">
            <Button size="sm" variant="secondary" onClick={handleCopy}>
              Copy
            </Button>
            <Button size="sm" variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
})

// Settings Modal Component
const SettingsModal: React.FC<{
  show: boolean
  onHide: () => void
  presets: Preset[]
  setPresets: React.Dispatch<React.SetStateAction<Preset[]>>
  activePresetIndex: number
  models: ModelInfo[]
  apiKey: string
  setApiKey: React.Dispatch<React.SetStateAction<string>>
  onPresetIndexChange: (index: number) => void
}> = ({
  show,
  onHide,
  presets,
  setPresets,
  activePresetIndex,
  models,
  apiKey,
  setApiKey,
  onPresetIndexChange,
}) => {
  const [selectedPresetIndex, setSelectedPresetIndex] =
    useState(activePresetIndex)
  const selectedPreset = presets[selectedPresetIndex]
  const selectedModel = models.find((m) => m.id === selectedPreset?.modelId)

  // Update selected preset when modal opens to show current chat's preset
  useEffect(() => {
    if (show) {
      setSelectedPresetIndex(activePresetIndex)
    }
  }, [show, activePresetIndex])

  const updatePreset = (field: keyof Preset, value: any) => {
    const newPresets = [...presets]
    newPresets[selectedPresetIndex] = {
      ...newPresets[selectedPresetIndex],
      [field]: value,
    }
    setPresets(newPresets)
  }

  const inputCost = selectedModel
    ? (parseFloat(selectedModel.pricing.prompt) * 1000000).toFixed(2)
    : "0.00"
  const outputCost = selectedModel
    ? (parseFloat(selectedModel.pricing.completion) * 1000000).toFixed(2)
    : "0.00"

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
                variant={
                  index === selectedPresetIndex ? "primary" : "outline-primary"
                }
                size="sm"
                onClick={() => {
                  setSelectedPresetIndex(index)
                  onPresetIndexChange(index)
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
                  onChange={(e) => updatePreset("name", e.target.value)}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Model</Form.Label>
                <Form.Select
                  value={selectedPreset.modelId}
                  onChange={(e) => updatePreset("modelId", e.target.value)}
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
                  onChange={(e) => updatePreset("systemPrompt", e.target.value)}
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
                      onChange={(e) =>
                        updatePreset("temperature", parseFloat(e.target.value))
                      }
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
                      onChange={(e) =>
                        updatePreset("topP", parseFloat(e.target.value))
                      }
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
                      onChange={(e) =>
                        updatePreset("maxTokens", parseInt(e.target.value))
                      }
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
                      onChange={(e) =>
                        updatePreset("reasoningEffort", e.target.value)
                      }
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
                      onChange={(e) =>
                        updatePreset(
                          "reasoningMaxTokens",
                          parseInt(e.target.value)
                        )
                      }
                      disabled={selectedPreset.reasoningEffort !== "none"}
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Exclude Reasoning</Form.Label>
                    <Form.Check
                      type="checkbox"
                      checked={selectedPreset.reasoningExclude}
                      onChange={(e) =>
                        updatePreset("reasoningExclude", e.target.checked)
                      }
                      label="Exclude from response"
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Input Cost (per MTok)</Form.Label>
                    <Form.Control
                      type="text"
                      value={`$${inputCost}`}
                      readOnly
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Output Cost (per MTok)</Form.Label>
                    <Form.Control
                      type="text"
                      value={`$${outputCost}`}
                      readOnly
                    />
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
  )
}

// Chat Area Component
const ChatArea: React.FC<{
  chat: Chat | null
  presets: Preset[]
  onUpdateMessage: (messageId: string, content: string) => void
  onDeleteMessage: (messageId: string) => void
  onSendMessage: (content: string) => void
  onStopMessage: () => void
  onPresetSelect: (index: number) => void
  onOpenSettings: () => void
  onAppend: (content: string) => void
  isLoading: boolean
  isStreaming: boolean
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>
}> = React.memo(({
  chat,
  presets,
  onUpdateMessage,
  onDeleteMessage,
  onSendMessage,
  onStopMessage,
  onPresetSelect,
  onOpenSettings,
  onAppend,
  isLoading,
  isStreaming,
  setChats,
}) => {
  const [inputValue, setInputValue] = useState("")
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const emojis = [
    "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
    "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙",
    "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔",
    "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥",
    "😔", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢",
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
    "👍", "👎", "👌", "🤞", "✌️", "🤟", "🤘", "👊", "✊", "🤛",
    "🔥", "💯", "💥", "⚡", "🌟", "⭐", "🎉", "🎊", "🎈", "🎁"
  ]

  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current
      textarea.style.height = "auto"
      const maxHeight = window.innerHeight * 0.9
      const newHeight = Math.min(textarea.scrollHeight, maxHeight)
      textarea.style.height = `${newHeight}px`
    }
  }, [inputValue])

  useEffect(() => {
    if (shouldScrollToBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
      setShouldScrollToBottom(false)
    }
  }, [shouldScrollToBottom, chat?.messages])

  const handleSend = useCallback(() => {
    const canSendEmpty =
      chat?.messages.length &&
      chat.messages[chat.messages.length - 1].role === "user"
    if ((inputValue.trim() || canSendEmpty) && !isLoading) {
      setShouldScrollToBottom(true)
      onSendMessage(inputValue.trim())
      setInputValue("")
    }
  }, [inputValue, chat?.messages, isLoading, onSendMessage])

  const handleScrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [])

  const handleAppend = useCallback(() => {
    if (!isLoading) {
      setShouldScrollToBottom(true)
      onAppend(inputValue)
      setInputValue("")
    }
  }, [inputValue, isLoading, onAppend])

  const handleEmojiSelect = useCallback((emoji: string) => {
    setInputValue(prev => prev + emoji)
    setShowEmojiPicker(false)
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  const handleCopyMessage = useCallback((message: Message) => {
    let textToCopy = ""
    if (message.messageType === "reasoning") {
      textToCopy = message.reasoning || ""
    } else if (typeof message.content === "string") {
      textToCopy = message.content
    } else {
      // For array content, copy only text parts
      textToCopy = message.content
        .filter(item => item.type === "text")
        .map(item => (item as any).text)
        .join("\n")
    }
    navigator.clipboard.writeText(textToCopy)
  }, [])

  if (!chat) {
    return (
      <div className="h-100 p-4 d-flex align-items-center justify-content-center">
        <h3 className="text-muted">Select or create a chat to begin</h3>
      </div>
    )
  }

  return (
    <div className="h-100 p-4 position-relative">
      <div style={{ marginBottom: "60px" }}>
        <PresetBar
          presets={presets}
          activePresetIndex={chat.activePresetIndex}
          onSelect={onPresetSelect}
        />
      </div>

      <div
        className="overflow-auto"
        style={{ height: "calc(100vh - 200px)", marginBottom: "20px" }}
      >
        {chat.messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            onDeleteMessage={onDeleteMessage}
            onCopyMessage={handleCopyMessage}
            onUpdateMessage={onUpdateMessage}
            isStreaming={isStreaming}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="d-flex gap-2 align-items-end position-absolute bottom-0 start-0 end-0 p-1">
        <Dropdown show={showEmojiPicker} onToggle={setShowEmojiPicker}>
          <Dropdown.Toggle
            variant="outline-secondary"
            size="sm"
            style={{
              minWidth: "40px",
              height: "38px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            😀
          </Dropdown.Toggle>
          <Dropdown.Menu style={{ maxHeight: "200px", overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: "2px", padding: "8px" }}>
            {emojis.map((emoji, index) => (
              <Dropdown.Item
                key={index}
                onClick={() => handleEmojiSelect(emoji)}
                style={{
                  padding: "4px",
                  textAlign: "center",
                  border: "none",
                  background: "none",
                  fontSize: "18px",
                  cursor: "pointer"
                }}
              >
                {emoji}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
        <Form.Control
          as="textarea"
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          onPaste={async (e) => {
            const items = e.clipboardData?.items
            if (items) {
              for (let i = 0; i < items.length; i++) {
                const item = items[i]
                if (item.type.indexOf("image") !== -1) {
                  e.preventDefault()
                  const file = item.getAsFile()
                  if (file) {
                    try {
                      const base64Image = await imageToBase64(file)
                      const imageMessage: Message = {
                        id: uuidv4(),
                        role: "user",
                        content: [{
                          type: "image_url",
                          image_url: {
                            url: base64Image
                          }
                        }],
                        messageType: "regular",
                      }
                      onAppend("")
                      if (chat) {
                        setChats(prev =>
                          prev.map((c) =>
                            c.id === chat.id
                              ? { ...c, messages: [...c.messages.slice(0, -1), imageMessage] }
                              : c
                          )
                        )
                      }
                    } catch (error) {
                      console.error("Failed to process image:", error)
                    }
                  }
                  break
                }
              }
            }
          }}
          placeholder="Type your message..."
          disabled={isLoading}
          style={{
            minHeight: "38px",
            maxHeight: `${window.innerHeight * 0.9}px`,
            resize: "none",
            overflow: "auto",
            zIndex: 999,
          }}
        />
        <div className="d-flex flex-wrap gap-2" style={{ width: "180px" }}>
          <Button
            variant={isStreaming ? "danger" : "primary"}
            onClick={isStreaming ? onStopMessage : handleSend}
            disabled={
              !isStreaming &&
              (isLoading ||
                (!inputValue.trim() &&
                  (!chat?.messages.length ||
                    chat.messages[chat.messages.length - 1].role !== "user")))
            }
            style={{ width: "calc(50% - 4px)" }}
          >
            {isStreaming ? "Stop" : isLoading ? "Sending..." : "Send"}
          </Button>
          <Button
            variant="outline-primary"
            onClick={handleAppend}
            disabled={isLoading}
            style={{ width: "calc(50% - 4px)" }}
          >
            Append
          </Button>
          <Button
            variant="secondary"
            onClick={onOpenSettings}
            style={{ width: "calc(50% - 4px)" }}
          >
            Settings
          </Button>
          <Button
            variant="outline-secondary"
            onClick={handleScrollToBottom}
            style={{ width: "calc(50% - 4px)" }}
          >
            ⇩
          </Button>
        </div>
      </div>
    </div>
  )
})

// Main App Component
function App() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [apiKey, setApiKey] = useState<string>("")
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [presets, setPresets] = useState<Preset[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false)
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState<boolean>(false)
  const [abortController, setAbortController] =
    useState<AbortController | null>(null)

  // Load data from localStorage on mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem("ORI_apiKey")
    const savedChats = localStorage.getItem("ORI_chats")
    const savedPresets = localStorage.getItem("ORI_presets")

    if (savedApiKey) setApiKey(savedApiKey)
    if (savedChats) {
      const parsedChats = JSON.parse(savedChats)
      setChats(parsedChats)

      // Select the newest chat (highest created timestamp)
      if (parsedChats.length > 0) {
        const newestChat = parsedChats.reduce((newest: Chat, current: Chat) =>
          current.created > newest.created ? current : newest
        )
        setActiveChatId(newestChat.id)
      }
    }
    if (savedPresets) setPresets(JSON.parse(savedPresets))
  }, [])

  // Save data to localStorage when it changes
  useEffect(() => {
    if (apiKey) localStorage.setItem("ORI_apiKey", apiKey)
  }, [apiKey])

  useEffect(() => {
    if (chats.length > 0)
      localStorage.setItem("ORI_chats", JSON.stringify(chats))
  }, [chats])

  useEffect(() => {
    if (presets.length > 0)
      localStorage.setItem("ORI_presets", JSON.stringify(presets))
  }, [presets])

  // Update default chat names on app launch
  useEffect(() => {
    if (chats.length > 0) {
      const updatedChats = updateDefaultChatNames(chats)
      const hasChanges = updatedChats.some(
        (chat, index) => chat.name !== chats[index].name
      )
      if (hasChanges) {
        setChats(updatedChats)
      }
    }
  }, []) // Run once on mount after chats are loaded

  // Fetch models on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/models")
        const data = await response.json()
        const sortedModels = data.data.sort(
          (a: ModelInfo, b: ModelInfo) => b.created - a.created
        )
        setModels(sortedModels)

        // Initialize presets only if none exist and none were saved in localStorage
        const savedPresets = localStorage.getItem("ORI_presets")
        if (presets.length === 0 && !savedPresets && sortedModels.length > 0) {
          setPresets(createDefaultPresets(sortedModels[0].id))
        }
      } catch (error) {
        console.error("Failed to fetch models:", error)
      }
    }

    fetchModels()
  }, [presets.length])

  const activeChat = chats.find((chat) => chat.id === activeChatId) || null

  const handleCreateNewChat = useCallback(() => {
    const currentPresetIndex = activeChat?.activePresetIndex || 0
    const newChat: Chat = {
      id: uuidv4(),
      name: `Chat ${chats.length + 1}`,
      messages: [],
      activePresetIndex: currentPresetIndex,
      created: Date.now(),
    }
    setChats(prev => [...prev, newChat])
    setActiveChatId(newChat.id)
  }, [activeChat?.activePresetIndex, chats.length])

  const handleRenameChat = useCallback((chatId: string, newName: string) => {
    setChats(prev =>
      prev.map((chat) =>
        chat.id === chatId ? { ...chat, name: newName } : chat
      )
    )
  }, [])

  const handleDeleteChat = useCallback((chatId: string) => {
    setChats(prev => {
      const updatedChats = prev.filter((chat) => chat.id !== chatId)

      // If we deleted the active chat, select another one or set to null
      if (activeChatId === chatId) {
        if (updatedChats.length > 0) {
          // Select the most recent chat
          const newestChat = updatedChats.reduce((newest: Chat, current: Chat) =>
            current.created > newest.created ? current : newest
          )
          setActiveChatId(newestChat.id)
        } else {
          setActiveChatId(null)
        }
      }

      return updatedChats
    })
  }, [activeChatId])

  const handleDeleteMessage = useCallback((messageId: string) => {
    if (!activeChat) return
    setChats(prev =>
      prev.map((chat) =>
        chat.id === activeChat.id
          ? {
              ...chat,
              messages: chat.messages.filter(msg => msg.id !== messageId)
            }
          : chat
      )
    )
  }, [activeChat])

  const handleUpdateMessage = useCallback((messageId: string, content: string) => {
    if (!activeChat) return
    setChats(prev =>
      prev.map((chat) =>
        chat.id === activeChat.id
          ? {
              ...chat,
              messages: chat.messages.map((msg) =>
                msg.id === messageId ? { ...msg, content } : msg
              ),
            }
          : chat
      )
    )
  }, [activeChat])

  const handlePresetSelect = useCallback((index: number) => {
    if (!activeChat) return
    setChats(prev =>
      prev.map((chat) =>
        chat.id === activeChat.id ? { ...chat, activePresetIndex: index } : chat
      )
    )
  }, [activeChat])

  const handleAppendMessage = useCallback((content: string) => {
    if (!activeChat) return

    // Determine the role for the new message
    const lastMessage = activeChat.messages[activeChat.messages.length - 1]
    const newRole =
      !lastMessage || lastMessage.role === "assistant" ? "user" : "assistant"

    const newMessage: Message = {
      id: uuidv4(),
      role: newRole,
      content: content,
      messageType: "regular",
    }

    // Update chat name if it has a default name and this is a user message
    let updatedChatName = activeChat.name
    if (content && newRole === "user" && hasDefaultName(activeChat)) {
      updatedChatName = content.trim().substring(0, 20)
    }

    setChats(prev =>
      prev.map((chat) =>
        chat.id === activeChat.id
          ? {
              ...chat,
              messages: [...chat.messages, newMessage],
              name: updatedChatName
            }
          : chat
      )
    )
  }, [activeChat])

  const handleStopMessage = useCallback(() => {
    if (abortController) {
      abortController.abort()
      setAbortController(null)
      setIsStreaming(false)
      setIsLoading(false)
    }
  }, [abortController])

  const handleSendMessage = useCallback(async (content: string) => {
    if (!activeChat || !apiKey) {
      alert("Please set your API key in settings")
      return
    }

    // Remove all reasoning messages before sending new message
    const messagesWithoutReasoning = activeChat.messages.filter(
      (msg) => msg.messageType !== "reasoning"
    )

    const preset = presets[activeChat.activePresetIndex]
    const assistantMessage: Message = {
      id: uuidv4(),
      role: "assistant",
      content: "",
      messageType: "regular",
    }

    // Only add user message if content is not empty
    let updatedMessages: Message[]
    const currentMessages = messagesWithoutReasoning
    if (content) {
      const userMessage: Message = {
        id: uuidv4(),
        role: "user",
        content,
        messageType: "regular",
      }
      updatedMessages = [...currentMessages, userMessage, assistantMessage]
    } else {
      updatedMessages = [...currentMessages, assistantMessage]
    }

    // Update chat name if it has a default name and this is a user message
    let updatedChatName = activeChat.name
    if (content && hasDefaultName(activeChat)) {
      updatedChatName = content.trim().substring(0, 20)
    }

    setChats(prev =>
      prev.map((chat) =>
        chat.id === activeChat.id
          ? { ...chat, messages: updatedMessages, name: updatedChatName }
          : chat
      )
    )

    const controller = new AbortController()
    setAbortController(controller)
    setIsLoading(true)
    setIsStreaming(true)

    try {
      // Prepare messages for API
      const messagesForApi = updatedMessages.slice(0, -1).map(msg => ({
        role: msg.role,
        content: msg.content
      })) // Remove the assistant message we just added
      const apiMessages = preset.systemPrompt
        ? [{ role: "system", content: preset.systemPrompt }, ...messagesForApi]
        : messagesForApi

      // Prepare reasoning config
      const reasoningConfig: any = {}
      if (preset.reasoningEffort !== "none") {
        reasoningConfig.effort = preset.reasoningEffort
      } else if (preset.reasoningMaxTokens > 0) {
        reasoningConfig.max_tokens = preset.reasoningMaxTokens
      }
      if (preset.reasoningExclude) {
        reasoningConfig.exclude = true
      }

      const requestBody: any = {
        model: preset.modelId,
        messages: apiMessages,
        stream: true,
        temperature: preset.temperature,
        top_p: preset.topP,
        max_tokens: preset.maxTokens,
      }

      if (Object.keys(reasoningConfig).length > 0) {
        requestBody.reasoning = reasoningConfig
      }

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        }
      )

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error("No response body")

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6)
            if (data === "[DONE]") continue

            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta

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
                )
              }

              if (delta?.reasoning) {
                setChats((prevChats) =>
                  prevChats.map((chat) => {
                    if (chat.id === activeChat.id) {
                      // Find existing reasoning message or create new one
                      const existingReasoningMsg = chat.messages.find(
                        (msg) =>
                          msg.messageType === "reasoning" &&
                          msg.id.startsWith("reasoning-")
                      )

                      if (existingReasoningMsg) {
                        return {
                          ...chat,
                          messages: chat.messages.map((msg) =>
                            msg.id === existingReasoningMsg.id
                              ? {
                                  ...msg,
                                  reasoning:
                                    (msg.reasoning || "") + delta.reasoning,
                                }
                              : msg
                          ),
                        }
                      } else {
                        // Create new reasoning message
                        const reasoningMessage: Message = {
                          id: `reasoning-${uuidv4()}`,
                          role: "assistant",
                          content: "",
                          reasoning: delta.reasoning,
                          messageType: "reasoning",
                        }
                        // Insert reasoning message before the assistant message
                        const assistantIndex = chat.messages.findIndex(
                          (msg) => msg.id === assistantMessage.id
                        )
                        const newMessages = [...chat.messages]
                        newMessages.splice(assistantIndex, 0, reasoningMessage)
                        return { ...chat, messages: newMessages }
                      }
                    }
                    return chat
                  })
                )
              }
            } catch (e) {
              console.error("Failed to parse SSE data:", e)
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("Request was aborted")
      } else {
        console.error("Failed to send message:", error)
        alert(
          "Failed to send message. Please check your API key and try again."
        )
      }
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
      setAbortController(null)
    }
  }, [activeChat, apiKey, presets])

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
            onDeleteChat={handleDeleteChat}
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
            onStopMessage={handleStopMessage}
            onPresetSelect={handlePresetSelect}
            onOpenSettings={() => setShowSettingsModal(true)}
            onAppend={handleAppendMessage}
            isLoading={isLoading}
            isStreaming={isStreaming}
            setChats={setChats}
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
  )
}

export default App