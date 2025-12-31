
import Docker from 'dockerode';

const docker = new Docker();
const runtime = process.env.DOCKER_RUNTIME;

console.log(`Testing with Runtime: ${runtime}`);

async function test() {
    try {
        // Attempt to create a container. We don't need to start it to check runtime config validation usually,
        // but some docker versions validate on create.
        const container = await docker.createContainer({
            Image: 'hello-world',
            HostConfig: {
                Runtime: runtime,
                AutoRemove: true,
            }
        });
        console.log('Container created successfully (Runtime likely accepted or ignored)');
        await container.remove();
    } catch (e: any) {
        console.log('Error creating container:');
        console.log(e.message);
    }
}

test();
