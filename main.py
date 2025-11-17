import pygame
import random
import sys

# Initialize Pygame
pygame.init()

# Screen dimensions
WIDTH, HEIGHT = 400, 600
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Flappy Bird")

# Colors
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GREEN = (0, 200, 0)
SKY_BLUE = (135, 206, 235)

# Clock
clock = pygame.time.Clock()
FPS = 60

# Fonts
font = pygame.font.SysFont(None, 36)

# Bird properties
bird_size = 30
bird_x = 100
bird_y = HEIGHT // 2
bird_vel = 0
gravity = 0.5
jump_strength = -8

# Pipe properties
pipe_width = 70
pipe_gap = 150
pipe_vel = -4
pipes = []

# Score
score = 0
passed_pipes = set()

# Game state
game_over = False
started = False

def draw_bird(x, y):
    pygame.draw.circle(screen, BLACK, (x, y), bird_size // 2)

def create_pipe():
    top_height = random.randint(100, 400)
    bottom_y = top_height + pipe_gap
    return {
        'top': pygame.Rect(WIDTH, 0, pipe_width, top_height),
        'bottom': pygame.Rect(WIDTH, bottom_y, pipe_width, HEIGHT - bottom_y)
    }

def draw_pipes(pipes):
    for pipe in pipes:
        pygame.draw.rect(screen, GREEN, pipe['top'])
        pygame.draw.rect(screen, GREEN, pipe['bottom'])

def move_pipes(pipes):
    for pipe in pipes:
        pipe['top'].x += pipe_vel
        pipe['bottom'].x += pipe_vel

def check_collision(pipes, bird_rect):
    for pipe in pipes:
        if bird_rect.colliderect(pipe['top']) or bird_rect.colliderect(pipe['bottom']):
            return True
    if bird_rect.top <= 0 or bird_rect.bottom >= HEIGHT:
        return True
    return False

def draw_score(score):
    score_surface = font.render(f"Score: {score}", True, BLACK)
    screen.blit(score_surface, (10, 10))

def reset_game():
    global bird_y, bird_vel, pipes, score, passed_pipes, game_over, started
    bird_y = HEIGHT // 2
    bird_vel = 0
    pipes = []
    score = 0
    passed_pipes = set()
    game_over = False
    started = False

# Game loop
running = True
while running:
    screen.fill(SKY_BLUE)

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_SPACE:
                if not started:
                    started = True
                if not game_over:
                    bird_vel = jump_strength
                else:
                    reset_game()

    if started and not game_over:
        bird_vel += gravity
        bird_y += bird_vel

        # Spawn pipes
        if not pipes or pipes[-1]['top'].x < WIDTH - 200:
            pipes.append(create_pipe())

        move_pipes(pipes)

        # Remove off-screen pipes
        pipes = [p for p in pipes if p['top'].right > 0]

        # Score logic
        bird_rect = pygame.Rect(bird_x - bird_size // 2, bird_y - bird_size // 2, bird_size, bird_size)
        for i, pipe in enumerate(pipes):
            if pipe['top'].right < bird_x and i not in passed_pipes:
                passed_pipes.add(i)
                score += 1

        # Check collision
        if check_collision(pipes, bird_rect):
            game_over = True

    # Draw everything
    draw_bird(bird_x, int(bird_y))
    draw_pipes(pipes)
    draw_score(score)

    if not started:
        hint = font.render("Press SPACE to Start", True, BLACK)
        screen.blit(hint, (WIDTH // 2 - 100, HEIGHT // 2))

    if game_over:
        over_text = font.render("Game Over - SPACE to Restart", True, BLACK)
        screen.blit(over_text, (WIDTH // 2 - 150, HEIGHT // 2))

    pygame.display.flip()
    clock.tick(FPS)

pygame.quit()
sys.exit()