import Queue from 'bee-queue';
import axios from 'axios';

const myQueue = new Queue('myQueue');

myQueue.process(async (job) => {
  try {
    const { referencePublic, amount, userSender } = job.data;

    // Example POST API call with Axios, passing data as query parameters
    const apiUrl = 'https://tough-pantsuit-dove.cyclic.app/api/check/';
    const queryParams = {
      reference: referencePublic,
      amount,
      sender: userSender,
    };

    const response = await axios.post(apiUrl, null, {
      params: queryParams,
    });

    console.log('API call response:', response.data);

    return response.data; // You can return the API call response or modify as needed
  } catch (error) {
    console.error('Error in API call:', error.message);
    throw error; // Propagate the error to handle it appropriately
  }
});

export default myQueue;
