import React from 'react'
import './Spinner.css'

export default function Spinner({ size = 'md' }) {
  return <span className={`spinner spinner-${size}`} aria-label="Loading" />
}
