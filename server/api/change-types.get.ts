import { all } from '../utils/db'

export default defineEventHandler(() => all('SELECT id, name, default_risk FROM change_type ORDER BY name'))
