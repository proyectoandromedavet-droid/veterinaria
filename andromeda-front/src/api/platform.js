import axios from 'axios'

const platformHttp = axios.create({
  baseURL: '',
  withCredentials: true,
  timeout: 10000,
})

function unwrap(response) {
  return response?.data?.data ?? response?.data ?? response
}

export const platformApi = {
  healthDeep: () => platformHttp.get('/health/deep').then(unwrap),
}

export default platformApi
