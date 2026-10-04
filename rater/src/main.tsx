import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

document.title = 'Rater'

createRoot(document.getElementById('root')!).render(<App />)
