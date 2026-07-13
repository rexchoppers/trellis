import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Builder from './pages/Builder'
import RunView from './pages/RunView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pipelines/:id" element={<Builder />} />
        <Route path="/runs/:id" element={<RunView />} />
      </Routes>
    </BrowserRouter>
  )
}
