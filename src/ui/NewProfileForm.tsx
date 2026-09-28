import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PRESET_IDS, newProfileRaw, type PresetId } from '../data/presets'
import type { RawProfile } from '../data/rawProfile'
import { isIsoDate } from '../lib/naturalisation'

interface Props {
  defaultArrived: string
  onCreate: (raw: RawProfile) => void
  onCancel: () => void
}

export function NewProfileForm({ defaultArrived, onCreate, onCancel }: Props) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [arrivedUK, setArrivedUK] = useState(defaultArrived)
  const [ilrDate, setIlrDate] = useState('')
  const [preset, setPreset] = useState<PresetId>('standard')
  const valid = name.trim() !== '' && isIsoDate(arrivedUK) && (ilrDate === '' || isIsoDate(ilrDate))

  return (
    <form
      className="card new-profile"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onCreate(newProfileRaw(preset, { name: name.trim(), arrivedUK, ilrDate }))
      }}
    >
      <h2>{t('newProfile.title')}</h2>
      <div className="fields">
        <label>{t('editor.name')}<input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} /></label>
        <label>{t('editor.arrived')}<input type="date" value={arrivedUK} onChange={(e) => setArrivedUK(e.target.value)} /></label>
        <label>{t('editor.ilr')}<input type="date" value={ilrDate} onChange={(e) => setIlrDate(e.target.value)} /></label>
      </div>
      <fieldset className="presets">
        <legend>{t('newProfile.route')}</legend>
        {PRESET_IDS.map((id) => (
          <label key={id} className="preset">
            <input type="radio" name="preset" value={id} checked={preset === id} onChange={() => setPreset(id)} />
            <span>
              <strong>{t(`newProfile.${id}`)}</strong>
              <span className="hint">{t(`newProfile.${id}Desc`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="hint">{t('newProfile.hint')}</p>
      <div className="editor-actions">
        <button type="submit" className="btn primary" disabled={!valid}>{t('newProfile.create')}</button>
        <button type="button" className="btn" onClick={onCancel}>{t('newProfile.cancel')}</button>
      </div>
    </form>
  )
}
