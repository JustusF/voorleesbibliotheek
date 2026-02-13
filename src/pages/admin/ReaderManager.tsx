import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button, Card, Avatar, ConfirmDialog, useToast } from '../../components/ui'
import { getUsers, deleteUser } from '../../lib/storage'
import { AddReaderModal } from './AddReaderModal'
import { EditReaderModal } from './EditReaderModal'
import type { User } from '../../types'

interface ReaderManagerProps {
  onUsersChanged: () => void
}

export function ReaderManager({ onUsersChanged }: ReaderManagerProps) {
  const { showToast } = useToast()
  const [users, setUsers] = useState<User[]>(() => getUsers())
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showAddReader, setShowAddReader] = useState(false)
  const [showEditReader, setShowEditReader] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    confirmText?: string
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  })

  const refreshUsers = () => {
    setUsers(getUsers())
    onUsersChanged()
  }

  const handleEditReader = (user: User) => {
    setSelectedUser(user)
    setShowEditReader(true)
  }

  const handleDeleteReader = (userId: string) => {
    const user = users.find(u => u.id === userId)
    if (user?.role === 'admin') {
      showToast('Je kunt geen beheerder verwijderen.', 'error')
      return
    }
    setConfirmDialog({
      isOpen: true,
      title: 'Voorlezer verwijderen?',
      message: `Weet je zeker dat je "${user?.name || 'deze voorlezer'}" wilt verwijderen?`,
      confirmText: 'Verwijderen',
      onConfirm: () => {
        deleteUser(userId)
        refreshUsers()
      },
    })
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-display text-xl text-cocoa">Voorlezers</h2>
          <Button variant="primary" onClick={() => setShowAddReader(true)}>
            + Voorlezer toevoegen
          </Button>
        </div>

        <div className="space-y-3">
          {users.map((user) => (
            <Card key={user.id} className="p-4 flex items-center gap-4">
              <Avatar
                src={user.avatar_url}
                name={user.name}
                size="md"
              />
              <div className="flex-1">
                <p className="font-display text-lg text-cocoa">{user.name}</p>
                <p className="text-sm text-cocoa-light">
                  {user.role === 'admin' ? 'Beheerder' : 'Voorlezer'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEditReader(user)}
              >
                Bewerken
              </Button>
              {user.role !== 'admin' && (
                <button
                  onClick={() => handleDeleteReader(user.id)}
                  className="p-2 text-cocoa-light hover:text-sunset transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </Card>
          ))}
        </div>
      </motion.div>

      <AddReaderModal
        isOpen={showAddReader}
        onClose={() => setShowAddReader(false)}
        onReaderAdded={refreshUsers}
      />

      <EditReaderModal
        isOpen={showEditReader}
        user={selectedUser}
        onClose={() => { setShowEditReader(false); setSelectedUser(null) }}
        onReaderSaved={refreshUsers}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        variant="danger"
      />
    </>
  )
}
