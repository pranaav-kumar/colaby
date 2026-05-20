import Editor from "@monaco-editor/react";

function CodeEditor() {

  return (
    <Editor
      height="90vh"
      defaultLanguage="javascript"
      defaultValue="// write code here"
    />
  )
}

export default CodeEditor
